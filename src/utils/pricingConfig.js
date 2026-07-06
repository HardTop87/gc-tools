import Papa from 'papaparse';
import defaultConfig from '../data/pricingConfig.default.json';

const STORAGE_KEY = 'gc_rst_pricingConfig';
// Ungültige gespeicherte Configs werden hierhin gesichert statt still verworfen
const BACKUP_KEY = 'gc_rst_pricingConfig_backup';

export const REQUIRED_SETTINGS = Object.keys(defaultConfig.settings);

export function getDefaultPricingConfig() {
  return JSON.parse(JSON.stringify(defaultConfig));
}

export function bogenpreis(papier) {
  return (papier?.preisPro1000 ?? 0) / 1000;
}

export function validatePricingConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { ok: false, errors: ['Config ist kein Objekt.'] };
  }
  if (!config.meta?.version) errors.push('meta.version fehlt.');

  for (const key of REQUIRED_SETTINGS) {
    const value = config.settings?.[key];
    if (!Number.isFinite(value)) errors.push(`settings.${key} fehlt oder ist keine Zahl.`);
    else if (value < 0) errors.push(`settings.${key} darf nicht negativ sein.`);
  }

  if (!(config.papiere?.length >= 1)) errors.push('papiere: mindestens ein Papier erforderlich.');
  if (!(config.formate?.length >= 1)) errors.push('formate: mindestens ein Format erforderlich.');
  if (!(config.routen?.length >= 1)) errors.push('routen: mindestens eine Route erforderlich.');
  if (!(Object.keys(config.wvTabellen ?? {}).length >= 1)) {
    errors.push('wvTabellen: mindestens eine Tabelle erforderlich.');
  }

  const paperIds = new Set();
  for (const [i, p] of (config.papiere ?? []).entries()) {
    const where = `papiere[${i}] (${p?.id ?? '?'})`;
    if (!p?.id) errors.push(`${where}: id fehlt.`);
    else if (paperIds.has(p.id)) errors.push(`${where}: id doppelt.`);
    else paperIds.add(p.id);
    if (!p?.name) errors.push(`${where}: name fehlt.`);
    if (!['CC', 'N', 'BD', 'R'].includes(p?.familie)) errors.push(`${where}: familie muss CC/N/BD/R sein.`);
    if (!(p?.gsm > 0)) errors.push(`${where}: gsm muss > 0 sein.`);
    if (!(p?.dickeUm > 0)) errors.push(`${where}: dickeUm muss > 0 sein.`);
    if (!(p?.preisPro1000 > 0)) errors.push(`${where}: preisPro1000 muss > 0 sein.`);
  }

  let lastGsm = -Infinity;
  for (const [i, s] of (config.gewichtszuschlaege ?? []).entries()) {
    if (!(s?.abGsm > lastGsm)) errors.push(`gewichtszuschlaege[${i}]: abGsm nicht aufsteigend.`);
    lastGsm = s?.abGsm ?? lastGsm;
    if (!(s?.zuschlag >= 0)) errors.push(`gewichtszuschlaege[${i}]: zuschlag muss ≥ 0 sein.`);
  }

  const formatKeys = new Set();
  for (const [i, f] of (config.formate ?? []).entries()) {
    const where = `formate[${i}] (${f?.key ?? '?'})`;
    if (!f?.key) errors.push(`${where}: key fehlt.`);
    else formatKeys.add(f.key);
    if (!(f?.offenB > 0) || !(f?.offenH > 0)) errors.push(`${where}: offenB/offenH müssen > 0 sein.`);
    if (!(f?.nutzenGC >= 1) || !(f?.nutzenPartner >= 1)) errors.push(`${where}: nutzenGC/nutzenPartner müssen ≥ 1 sein.`);
    for (const listName of ['papiereInhalt', 'papiereUmschlag']) {
      for (const id of f?.[listName] ?? []) {
        if (!paperIds.has(id)) errors.push(`${where}: ${listName} referenziert unbekanntes Papier "${id}".`);
      }
    }
  }

  const tableNames = Object.keys(config.wvTabellen ?? {});
  for (const name of tableNames) {
    const table = config.wvTabellen[name];
    const rows = Object.keys(table).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i] !== rows[i - 1] + 1) {
        errors.push(`wvTabellen.${name}: Bogenteile-Zeilen nicht lückenlos (${rows[i - 1]} → ${rows[i]}).`);
      }
    }
    for (const row of rows) {
      const staffeln = Object.keys(table[row]).map(Number).sort((a, b) => a - b);
      let last = 0;
      for (const st of staffeln) {
        if (!(st > last)) errors.push(`wvTabellen.${name}[${row}]: Staffeln nicht aufsteigend.`);
        last = st;
        if (!(table[row][st] > 0)) errors.push(`wvTabellen.${name}[${row}][${st}]: Preis muss > 0 sein.`);
      }
    }
  }

  for (const [i, r] of (config.routen ?? []).entries()) {
    const where = `routen[${i}] (${r?.key ?? '?'})`;
    if (!r?.key || !r?.name) errors.push(`${where}: key/name fehlt.`);
    if (!['eigen', 'partner'].includes(r?.typ)) errors.push(`${where}: typ muss "eigen" oder "partner" sein.`);
    for (const fk of r?.formate ?? []) {
      if (!formatKeys.has(fk)) errors.push(`${where}: unbekanntes Format "${fk}".`);
    }
    if (!(config.settings?.[r?.maxDickeRef] > 0)) {
      errors.push(`${where}: maxDickeRef muss auf eine Einstellung > 0 verweisen.`);
    }
    if (r?.preferDeltaRef != null && !Number.isFinite(config.settings?.[r.preferDeltaRef])) {
      errors.push(`${where}: preferDeltaRef "${r.preferDeltaRef}" existiert nicht in den Einstellungen.`);
    }
    if (!['nutzenGC', 'nutzenPartner'].includes(r?.nutzenRef)) errors.push(`${where}: nutzenRef ungültig.`);
    const refs = typeof r?.wvTabelleRef === 'string' ? [r.wvTabelleRef] : Object.values(r?.wvTabelleRef ?? {});
    if (!refs.length) errors.push(`${where}: wvTabelleRef fehlt.`);
    for (const ref of refs) {
      if (!tableNames.includes(ref)) errors.push(`${where}: WV-Tabelle "${ref}" existiert nicht.`);
    }
  }

  if (!(config.cello?.arten ?? []).some((a) => a.key === 'ohne')) {
    errors.push('cello.arten: Art "ohne" fehlt.');
  }

  return { ok: errors.length === 0, errors };
}

// Lädt die Config und meldet, woher sie stammt:
// 'localStorage' (gültige gespeicherte Config), 'default' (nichts gespeichert)
// oder 'invalid-stored' (gespeicherte Config ungültig → Default aktiv,
// Original nach BACKUP_KEY gesichert, Fehlerliste in errors).
export function loadPricingConfigResult() {
  const fallback = getDefaultPricingConfig();
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { config: fallback, source: 'default', errors: [] };
  }
  if (!raw) return { config: fallback, source: 'default', errors: [] };

  let errors;
  try {
    const parsed = JSON.parse(raw);
    const validation = validatePricingConfig(parsed);
    if (validation.ok) return { config: parsed, source: 'localStorage', errors: [] };
    errors = validation.errors;
  } catch (error) {
    errors = [`Gespeicherte Config ist kein gültiges JSON: ${error.message}`];
  }

  try {
    localStorage.setItem(BACKUP_KEY, raw);
  } catch {
    // Backup ist Best-Effort
  }
  return { config: fallback, source: 'invalid-stored', errors };
}

export function loadPricingConfig() {
  return loadPricingConfigResult().config;
}

export function hasStoredPricingConfig() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

// Persistiert nur gültige Configs — localStorage darf nie einen Stand enthalten,
// den loadPricingConfig wieder verwerfen müsste. Gibt zurück, ob gespeichert wurde.
export function savePricingConfig(config) {
  if (!validatePricingConfig(config).ok) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Quota/Privacy-Fehler bewusst schlucken — Config lebt dann nur im State
  }
  return true;
}

export function resetPricingConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorieren
  }
  return getDefaultPricingConfig();
}

// ---------------------------------------------------------------------------
// Geteilter Preisstand (Vercel Blob über /api/config)
// Der Blob ist die Quelle der Wahrheit; localStorage dient nur als
// Offline-Cache, damit bei kurzem Netzausfall der zuletzt bekannte Stand
// gilt statt der Repo-Standardwerte.
// ---------------------------------------------------------------------------
const SHARED_API = '/api/config';
const SHARED_TIMEOUT_MS = 6000;
const PENDING_KEY = 'gc_rst_pendingPublish';

// Revision eines Config-Objekts (fehlt beim Repo-Default → 0).
export function configRev(config) {
  return Number.isFinite(config?.meta?.rev) ? config.meta.rev : 0;
}

// Auth-Header: das App-Passwort ist ohnehin im Bundle; der Header verhindert
// anonymen Zugriff auf den Endpunkt (curl/Scanner), nicht mehr und nicht weniger.
function authHeaders(extra = {}) {
  const pw = import.meta.env.VITE_APP_PASSWORD;
  return pw ? { ...extra, 'x-gc-auth': pw } : { ...extra };
}

// AbortSignal.timeout gibt es nicht überall (ältere Safari/WebViews) — Fallback.
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// Liest den geteilten Stand. source:
//  'shared'  → gültiger geteilter Stand geladen (Cache aktualisiert)
//  'none'    → es wurde noch nie ein Stand veröffentlicht
//  'invalid' → geteilter Stand ist ungültig (errors gesetzt)
//  'error'   → nicht erreichbar/Timeout (offline)
export async function fetchSharedConfig() {
  let response;
  try {
    response = await fetch(SHARED_API, {
      cache: 'no-store',
      headers: authHeaders(),
      signal: timeoutSignal(SHARED_TIMEOUT_MS),
    });
  } catch (error) {
    return { config: null, source: 'error', errors: [String(error?.message || error)] };
  }

  if (response.status === 204) return { config: null, source: 'none', errors: [] };
  if (!response.ok) return { config: null, source: 'error', errors: [`HTTP ${response.status}`] };

  let parsed;
  try {
    parsed = await response.json();
  } catch (error) {
    return { config: null, source: 'error', errors: [String(error?.message || error)] };
  }

  const validation = validatePricingConfig(parsed);
  if (!validation.ok) return { config: null, source: 'invalid', errors: validation.errors };

  savePricingConfig(parsed); // Offline-Cache aktualisieren
  return { config: parsed, source: 'shared', errors: [] };
}

// Veröffentlicht einen Stand für alle. baseRev = Revision, auf der die Änderung
// aufsetzt; der Server lehnt mit 409 ab, wenn zwischenzeitlich jemand anders
// veröffentlicht hat. Rückgabe:
//  { ok:true, rev }                    → veröffentlicht, neue Revision
//  { ok:false, conflict:true, currentRev } → Konflikt (neu laden nötig)
//  { ok:false, offline:true, errors }  → nicht erreichbar
//  { ok:false, errors }                → ungültig/abgelehnt
export async function saveSharedConfig(config, baseRev = configRev(config)) {
  const validation = validatePricingConfig(config);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  let response;
  try {
    response = await fetch(SHARED_API, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ config, baseRev }),
    });
  } catch (error) {
    return { ok: false, offline: true, errors: [String(error?.message || error)] };
  }

  if (response.status === 409) {
    let currentRev = null;
    try {
      currentRev = (await response.json())?.currentRev ?? null;
    } catch {
      // ohne Body weiter
    }
    return { ok: false, conflict: true, currentRev, errors: ['Zwischenzeitlich geändert.'] };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) detail = body.error;
    } catch {
      // Antwort ohne JSON-Body — Standard-Detail behalten
    }
    // 5xx = Server/Netz → als offline behandeln (Retry möglich); 4xx = Ablehnung
    const offline = response.status >= 500;
    return { ok: false, offline, errors: [detail] };
  }

  let rev = configRev(config) + 1;
  try {
    const body = await response.json();
    if (Number.isFinite(body?.rev)) rev = body.rev;
  } catch {
    // ohne Body: geschätzte Revision behalten
  }
  const stored = { ...config, meta: { ...config.meta, rev } };
  savePricingConfig(stored); // Offline-Cache aktualisieren
  return { ok: true, rev };
}

// Nicht veröffentlichte Änderung merken, damit sie bei einem Netzausfall nicht
// beim nächsten Laden still vom Blob-Stand überschrieben wird.
export function setPendingPublish(config) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(config));
  } catch {
    // ignorieren
  }
}

export function getPendingPublish() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validatePricingConfig(parsed).ok ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingPublish() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignorieren
  }
}

export const PAPER_CSV_HEADER = ['id', 'name', 'familie', 'gsm', 'dicke_um', 'preis_pro_1000'];

export function buildPaperPriceRows(config) {
  return config.papiere.map((p) => ({
    id: p.id,
    name: p.name,
    familie: p.familie,
    gsm: p.gsm,
    dicke_um: p.dickeUm,
    preis_pro_1000: p.preisPro1000,
  }));
}

export function buildPaperPriceCsv(config) {
  const rows = buildPaperPriceRows(config).map((row) => ({
    ...row,
    // Dezimalkomma nur für den Preis (deutschsprachiges Excel); IDs/Namen unangetastet
    preis_pro_1000: String(row.preis_pro_1000).replace('.', ','),
  }));
  return Papa.unparse(rows, { delimiter: ';', columns: PAPER_CSV_HEADER });
}

// Akzeptiert deutsche und englische Schreibweisen: "35,5", "35.5",
// "1.234,5", "1,234.5", "1.234.567". Bei Komma UND Punkt gilt das zuletzt
// stehende Zeichen als Dezimaltrennzeichen; ein einzelnes Trennzeichen wird
// als Dezimaltrennzeichen gelesen, mehrfach vorkommende als Tausendertrenner.
export function parseFlexibleNumber(value) {
  if (typeof value === 'number') return value;
  let s = String(value ?? '').trim();
  if (!s) return NaN;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const commas = s.match(/,/g).length;
    s = commas > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot !== -1) {
    const dots = s.match(/\./g).length;
    if (dots > 1) s = s.replace(/\./g, '');
  }

  const parsed = parseFloat(s);
  return Number.isFinite(parsed) ? parsed : NaN;
}

// Gemeinsame Zeilenprüfung für CSV- UND XLSX-Import (identische Regeln,
// identisches Zahlenparsing). rawRows: Objekte mit kleingeschriebenen Keys.
export function normalizePaperPriceRows(rawRows) {
  const rows = [];
  const errors = [];

  rawRows.forEach((raw, i) => {
    const id = String(raw.id ?? '').trim();
    const preis = parseFlexibleNumber(raw.preis_pro_1000);
    if (!id) {
      errors.push(`Zeile ${i + 2}: id fehlt.`);
      return;
    }
    if (!(preis > 0)) {
      errors.push(`Zeile ${i + 2} (${id}): preis_pro_1000 muss eine Zahl > 0 sein.`);
      return;
    }
    const row = { id, preis_pro_1000: preis };
    if (raw.dicke_um !== undefined && String(raw.dicke_um).trim() !== '') {
      const dicke = parseFlexibleNumber(raw.dicke_um);
      if (!(dicke > 0)) {
        errors.push(`Zeile ${i + 2} (${id}): dicke_um muss eine Zahl > 0 sein.`);
        return;
      }
      row.dicke_um = dicke;
    }
    rows.push(row);
  });

  return { rows, errors };
}

export function parsePaperPriceCsv(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  const fields = parsed.meta?.fields ?? [];
  if (!fields.includes('id') || !fields.includes('preis_pro_1000')) {
    return { rows: [], errors: ['CSV benötigt mindestens die Spalten "id" und "preis_pro_1000".'] };
  }
  return normalizePaperPriceRows(parsed.data);
}

// Wendet importierte Preiszeilen an: Matching über id, aktualisiert nur
// preisPro1000 (und optional dickeUm); unbekannte IDs werden gelistet, nie angelegt.
export function applyPaperPriceRows(config, rows) {
  const next = JSON.parse(JSON.stringify(config));
  const byId = new Map(next.papiere.map((p) => [p.id, p]));
  const summary = { geaendert: [], unveraendert: [], unbekannt: [] };

  for (const row of rows) {
    const paper = byId.get(row.id);
    if (!paper) {
      summary.unbekannt.push(row.id);
      continue;
    }
    const priceChanged = paper.preisPro1000 !== row.preis_pro_1000;
    const dickeChanged = row.dicke_um !== undefined && paper.dickeUm !== row.dicke_um;
    if (priceChanged) paper.preisPro1000 = row.preis_pro_1000;
    if (dickeChanged) paper.dickeUm = row.dicke_um;
    if (priceChanged || dickeChanged) summary.geaendert.push(row.id);
    else summary.unveraendert.push(row.id);
  }

  return { config: next, summary };
}
