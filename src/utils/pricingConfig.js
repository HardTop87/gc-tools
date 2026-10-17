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

const FAMILIEN = ['CC', 'N', 'BD', 'R'];

function isObj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Zahl, die auch nach Typprüfung eine Zahl ist: '67' > 0 wäre per Koerzion
// wahr, würde aber in der Engine String-Preise ("15" + 3 = "153") erzeugen.
function numAbove(value, min) {
  return Number.isFinite(value) && value > min;
}

function numAtLeast(value, min) {
  return Number.isFinite(value) && value >= min;
}

// Objektschlüssel der WV-Tabellen (Bogenteile-Zeilen, Auflagenstaffeln) als
// ganze Zahl ≥ 1. Muss verlustfrei zurück in den Schlüssel passen ("007" oder
// "1.5" findet die Engine über row[Number] nicht wieder) → sonst NaN.
function intKey(key) {
  return /^[1-9]\d*$/.test(key) ? Number(key) : NaN;
}

// Validierung darf nie werfen (Bug-Hunt V5 N8): die Verwaltung ruft sie im
// Publish-Pfad auf, und eine Exception dort ließe den In-Flight-Zustand hängen.
// Alle Zugriffe auf möglicherweise fehlende/falsch getypte Teile sind unten
// abgesichert; der try/catch ist nur das letzte Netz.
export function validatePricingConfig(config) {
  try {
    const errors = collectConfigErrors(config);
    return { ok: errors.length === 0, errors };
  } catch (error) {
    return { ok: false, errors: [`Config konnte nicht geprüft werden: ${error?.message ?? error}`] };
  }
}

function collectConfigErrors(config) {
  const errors = [];

  if (!isObj(config)) return ['Config ist kein Objekt.'];
  if (!config.meta?.version) errors.push('meta.version fehlt.');

  const s = isObj(config.settings) ? config.settings : {};
  for (const key of REQUIRED_SETTINGS) {
    const value = s[key];
    if (!Number.isFinite(value)) errors.push(`settings.${key} fehlt oder ist keine Zahl.`);
    else if (value < 0) errors.push(`settings.${key} darf nicht negativ sein.`);
  }

  // Kassen-Anker (2.6.0): 0 = aus, sonst ganze Zahl 2–20. Über 20 gemessen
  // Preisrückgänge bei mehr Seiten (Ausblendung über zu viele Staffeln), über
  // 500 wäre der Anker still aus (GC-Höchstauflage). Kassenpreise > 0 und in
  // sich steigend (große Klasse ≥ kleine, mit Umschlag ≥ ohne).
  if (Number.isFinite(s.kleinmengenBisAuflage)) {
    const bis = s.kleinmengenBisAuflage;
    if (!(bis === 0 || (Number.isInteger(bis) && bis >= 2 && bis <= 20))) {
      errors.push('settings.kleinmengenBisAuflage muss 0 (aus) oder eine ganze Zahl von 2 bis 20 sein.');
    }
  }
  const kasse = ['kleinmengenKasseBisGrenzeOhne', 'kleinmengenKasseBisGrenzeMit', 'kleinmengenKasseAbGrenzeOhne', 'kleinmengenKasseAbGrenzeMit'];
  if (kasse.every((key) => Number.isFinite(s[key]))) {
    if (kasse.some((key) => !(s[key] > 0))) errors.push('Kassenpreise (Kleinmengen) müssen größer als 0 sein.');
    if (s.kleinmengenKasseAbGrenzeOhne < s.kleinmengenKasseBisGrenzeOhne || s.kleinmengenKasseAbGrenzeMit < s.kleinmengenKasseBisGrenzeMit) {
      errors.push('Kassenpreise (Kleinmengen): die große Seitenklasse darf nicht billiger sein als die kleine.');
    }
    if (s.kleinmengenKasseBisGrenzeMit < s.kleinmengenKasseBisGrenzeOhne || s.kleinmengenKasseAbGrenzeMit < s.kleinmengenKasseAbGrenzeOhne) {
      errors.push('Kassenpreise (Kleinmengen): mit Umschlag darf nicht billiger sein als ohne.');
    }
  }

  // Pflichtlisten (Bug-Hunt V5 M1): eine fehlende oder falsch getypte Liste
  // kam bisher als `?? []` durch und ließ die Engine mit TypeError abstürzen —
  // Rechner für alle Nutzer in der ErrorBoundary, bis jemand den Verlauf nutzt.
  for (const [name, label] of [['papiere', 'ein Papier'], ['formate', 'ein Format'], ['routen', 'eine Route']]) {
    if (!Array.isArray(config[name])) errors.push(`${name}: muss eine Liste sein.`);
    else if (!config[name].length) errors.push(`${name}: mindestens ${label} erforderlich.`);
  }
  if (!Array.isArray(config.gewichtszuschlaege)) {
    errors.push('gewichtszuschlaege: muss eine Liste sein (darf leer sein).');
  }
  if (!isObj(config.wvTabellen)) errors.push('wvTabellen: muss ein Objekt mit Tabellen sein.');
  else if (!Object.keys(config.wvTabellen).length) errors.push('wvTabellen: mindestens eine Tabelle erforderlich.');
  if (config.umschlagAusnahmen != null && !isObj(config.umschlagAusnahmen)) {
    errors.push('umschlagAusnahmen: muss ein Objekt (Inhaltspapier → Liste von Umschlag-IDs) sein.');
  }
  if (!isObj(config.cello)) errors.push('cello: fehlt oder ist kein Objekt.');

  const paperIds = new Set();
  for (const [i, p] of asArray(config.papiere).entries()) {
    const where = `papiere[${i}] (${p?.id ?? '?'})`;
    if (!isObj(p)) {
      errors.push(`${where}: kein Objekt.`);
      continue;
    }
    if (!isText(p.id)) errors.push(`${where}: id fehlt.`);
    else if (paperIds.has(p.id)) errors.push(`${where}: id doppelt.`);
    else paperIds.add(p.id);
    if (!isText(p.name)) errors.push(`${where}: name fehlt.`);
    if (!FAMILIEN.includes(p.familie)) errors.push(`${where}: familie muss CC/N/BD/R sein.`);
    for (const field of ['gsm', 'dickeUm', 'preisPro1000']) {
      if (!numAbove(p[field], 0)) errors.push(`${where}: ${field} muss eine Zahl > 0 sein.`);
    }
  }

  let lastGsm = -Infinity;
  for (const [i, g] of asArray(config.gewichtszuschlaege).entries()) {
    const where = `gewichtszuschlaege[${i}]`;
    if (!isObj(g)) {
      errors.push(`${where}: kein Objekt.`);
      continue;
    }
    if (!numAtLeast(g.abGsm, 0)) errors.push(`${where}: abGsm muss eine Zahl ≥ 0 sein.`);
    else if (!(g.abGsm > lastGsm)) errors.push(`${where}: abGsm nicht aufsteigend.`);
    if (Number.isFinite(g.abGsm)) lastGsm = g.abGsm;
    if (!numAtLeast(g.zuschlag, 0)) errors.push(`${where}: zuschlag muss eine Zahl ≥ 0 sein.`);
  }

  const formatKeys = new Set();
  // Alle Papiere, die irgendein Format als Umschlag anbietet (für umschlagAusnahmen)
  const umschlagIdsAllerFormate = new Set();
  for (const [i, f] of asArray(config.formate).entries()) {
    const where = `formate[${i}] (${f?.key ?? '?'})`;
    if (!isObj(f)) {
      errors.push(`${where}: kein Objekt.`);
      continue;
    }
    if (!isText(f.key)) errors.push(`${where}: key fehlt.`);
    else if (formatKeys.has(f.key)) errors.push(`${where}: key doppelt.`);
    else formatKeys.add(f.key);
    if (!isText(f.name)) errors.push(`${where}: name fehlt.`);
    for (const field of ['offenB', 'offenH']) {
      if (!numAbove(f[field], 0)) errors.push(`${where}: ${field} muss eine Zahl > 0 sein.`);
    }
    for (const field of ['nutzenGC', 'nutzenPartner']) {
      if (!numAtLeast(f[field], 1)) errors.push(`${where}: ${field} muss eine Zahl ≥ 1 sein.`);
    }
    for (const listName of ['papiereInhalt', 'papiereUmschlag']) {
      if (!Array.isArray(f[listName])) {
        errors.push(`${where}: ${listName} muss eine Liste von Papier-IDs sein.`);
        continue;
      }
      for (const id of f[listName]) {
        if (!paperIds.has(id)) errors.push(`${where}: ${listName} referenziert unbekanntes Papier "${id}".`);
        else if (listName === 'papiereUmschlag') umschlagIdsAllerFormate.add(id);
      }
    }
    if (Array.isArray(f.papiereInhalt) && !f.papiereInhalt.length) {
      errors.push(`${where}: papiereInhalt braucht mindestens ein Inhaltspapier.`);
    }
  }

  // umschlagAusnahmen ist optional: Inhaltspapier-ID → zusätzlich erlaubte Umschlag-IDs.
  // Ein Umschlag, den kein Format anbietet, wäre eine wirkungslose Ausnahme (N5).
  const ausnahmen = isObj(config.umschlagAusnahmen) ? config.umschlagAusnahmen : {};
  for (const [inhaltId, coverIds] of Object.entries(ausnahmen)) {
    const where = `umschlagAusnahmen.${inhaltId}`;
    if (!paperIds.has(inhaltId)) errors.push(`${where}: unbekanntes Inhaltspapier.`);
    if (!Array.isArray(coverIds)) {
      errors.push(`${where}: muss eine Liste von Umschlag-IDs sein.`);
      continue;
    }
    for (const id of coverIds) {
      if (!paperIds.has(id)) errors.push(`${where}: unbekanntes Umschlagpapier "${id}".`);
      else if (!umschlagIdsAllerFormate.has(id)) {
        errors.push(`${where}: Umschlagpapier "${id}" ist in keinem Format als Umschlag hinterlegt — die Ausnahme wäre wirkungslos.`);
      }
    }
  }

  // WV-Tabellen: Zeile = Bogenteile (lückenlos), Spalte = Auflagenstaffel.
  // Gesamtpreise müssen mit der Auflage und mit den Bogenteilen steigen oder
  // gleich bleiben (N2) — ein Tippfehler „1" statt „75" ließe den Preis mit der
  // Auflage fallen. Je Tabelle wird die höchste Staffel gemerkt, die in ALLEN
  // Zeilen vorkommt: bis dorthin ist der Preis belegt, darüber friert die
  // Engine ihn ein (siehe maxAuflage-Prüfung bei den Routen, M3).
  const tables = isObj(config.wvTabellen) ? config.wvTabellen : {};
  const tableNames = Object.keys(tables);
  const tableMaxStaffel = new Map();
  for (const name of tableNames) {
    const table = tables[name];
    const where = `wvTabellen.${name}`;
    if (!isObj(table)) {
      errors.push(`${where}: Tabelle fehlt oder ist kein Objekt.`);
      continue;
    }
    const rowKeys = Object.keys(table);
    if (!rowKeys.length) {
      errors.push(`${where}: Tabelle ist leer.`);
      continue;
    }
    const rows = rowKeys.map(intKey);
    if (rows.some((row) => !(row >= 1))) {
      errors.push(`${where}: Bogenteile-Zeilen müssen ganze Zahlen ≥ 1 sein.`);
      continue;
    }
    rows.sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i] !== rows[i - 1] + 1) {
        errors.push(`${where}: Bogenteile-Zeilen nicht lückenlos (${rows[i - 1]} → ${rows[i]}).`);
      }
    }

    let tableOk = true;
    let maxStaffel = Infinity;
    let prevRow = null;
    for (const r of rows) {
      const row = table[r];
      const rowWhere = `${where}[${r}]`;
      const staffeln = isObj(row) ? Object.keys(row).map(intKey) : [];
      if (!isObj(row)) errors.push(`${rowWhere}: Zeile fehlt oder ist kein Objekt.`);
      else if (!staffeln.length) errors.push(`${rowWhere}: keine Auflagenstaffel hinterlegt.`);
      else if (staffeln.some((st) => !(st >= 1))) errors.push(`${rowWhere}: Auflagenstaffeln müssen ganze Zahlen ≥ 1 sein.`);
      if (!isObj(row) || !staffeln.length || staffeln.some((st) => !(st >= 1))) {
        tableOk = false;
        prevRow = null;
        continue;
      }
      staffeln.sort((a, b) => a - b);

      let rowOk = true;
      let lastPreis = -Infinity;
      for (const st of staffeln) {
        const preis = row[st];
        if (!numAbove(preis, 0)) {
          errors.push(`${rowWhere}[${st}]: Preis muss eine Zahl > 0 sein.`);
          rowOk = false;
          continue;
        }
        if (preis < lastPreis) {
          errors.push(`${rowWhere}[${st}]: Preis ${preis} fällt gegenüber der kleineren Staffel (${lastPreis}).`);
        }
        lastPreis = preis;
      }
      if (rowOk && prevRow) {
        for (const st of staffeln) {
          if (Number.isFinite(prevRow[st]) && row[st] < prevRow[st]) {
            errors.push(`${rowWhere}[${st}]: Preis ${row[st]} liegt unter dem der vorherigen Zeile (${prevRow[st]}) — mehr Bogenteile dürfen nicht billiger sein.`);
          }
        }
      }
      if (!rowOk) tableOk = false;
      prevRow = rowOk ? row : null;
      maxStaffel = Math.min(maxStaffel, staffeln[staffeln.length - 1]);
    }
    if (tableOk) tableMaxStaffel.set(name, maxStaffel);
  }

  for (const [i, r] of asArray(config.routen).entries()) {
    const where = `routen[${i}] (${r?.key ?? '?'})`;
    if (!isObj(r)) {
      errors.push(`${where}: kein Objekt.`);
      continue;
    }
    if (!isText(r.key) || !isText(r.name)) errors.push(`${where}: key/name fehlt.`);
    if (!['eigen', 'partner'].includes(r.typ)) errors.push(`${where}: typ muss "eigen" oder "partner" sein.`);
    if (!Array.isArray(r.formate) || !r.formate.length) {
      errors.push(`${where}: formate muss eine nicht leere Liste von Format-Keys sein.`);
    } else {
      for (const fk of r.formate) {
        if (!formatKeys.has(fk)) errors.push(`${where}: unbekanntes Format "${fk}".`);
      }
    }
    // Werktage (N1): ohne Zahl stünde im Ergebnis produktionszeitWT = undefined
    for (const field of ['wtStandard', 'wtExpress']) {
      if (!numAtLeast(r[field], 1)) errors.push(`${where}: ${field} muss eine Zahl ≥ 1 sein (Werktage).`);
    }
    // minAuflage: leer (null) = keine Untergrenze. maxAuflage ist Pflicht (M3):
    // 0 oder leer wirkte in der Engine wie „unbegrenzt", und über der höchsten
    // Staffel rechnet getPriceFromTable mit dem eingefrorenen Staffelpreis weiter
    // (Bug-Hunt B1: 4.000 Ex. zum Verarbeitungspreis von 1.000).
    if (r.minAuflage != null && !numAtLeast(r.minAuflage, 1)) {
      errors.push(`${where}: minAuflage muss leer oder eine Zahl ≥ 1 sein.`);
    }
    const maxOk = numAtLeast(r.maxAuflage, 1);
    if (!maxOk) errors.push(`${where}: maxAuflage muss eine Zahl ≥ 1 sein (0 oder leer gilt nicht als „unbegrenzt").`);
    if (maxOk && Number.isFinite(r.minAuflage) && r.minAuflage > r.maxAuflage) {
      errors.push(`${where}: minAuflage (${r.minAuflage}) liegt über maxAuflage (${r.maxAuflage}).`);
    }
    if (!numAbove(s[r.maxDickeRef], 0)) {
      errors.push(`${where}: maxDickeRef muss auf eine Einstellung > 0 verweisen.`);
    }
    if (r.preferDeltaRef != null && !Number.isFinite(s[r.preferDeltaRef])) {
      errors.push(`${where}: preferDeltaRef "${r.preferDeltaRef}" existiert nicht in den Einstellungen.`);
    }
    if (!['nutzenGC', 'nutzenPartner'].includes(r.nutzenRef)) errors.push(`${where}: nutzenRef ungültig.`);

    let refs = [];
    if (isText(r.wvTabelleRef)) refs = [r.wvTabelleRef];
    else if (isObj(r.wvTabelleRef)) refs = Object.values(r.wvTabelleRef);
    if (!refs.length) errors.push(`${where}: wvTabelleRef fehlt.`);
    for (const ref of refs) {
      if (!tableNames.includes(ref)) {
        errors.push(`${where}: WV-Tabelle "${ref}" existiert nicht.`);
        continue;
      }
      const grenze = tableMaxStaffel.get(ref);
      if (maxOk && grenze !== undefined && r.maxAuflage > grenze) {
        errors.push(`${where}: maxAuflage (${r.maxAuflage}) liegt über der höchsten Staffel (${grenze}) der WV-Tabelle "${ref}" — darüber würde der Verarbeitungspreis eingefroren.`);
      }
    }
  }

  const cello = isObj(config.cello) ? config.cello : {};
  if (!Array.isArray(cello.erlaubteFamilien)) {
    errors.push('cello.erlaubteFamilien: muss eine Liste von Papierfamilien sein.');
  } else {
    for (const fam of cello.erlaubteFamilien) {
      if (!FAMILIEN.includes(fam)) errors.push(`cello.erlaubteFamilien: unbekannte Familie "${fam}".`);
    }
  }
  if (!Array.isArray(cello.arten)) {
    errors.push('cello.arten: muss eine Liste sein.');
  } else {
    const artKeys = new Set();
    for (const [i, a] of cello.arten.entries()) {
      const where = `cello.arten[${i}] (${a?.key ?? '?'})`;
      if (!isObj(a)) {
        errors.push(`${where}: kein Objekt.`);
        continue;
      }
      if (!isText(a.key)) errors.push(`${where}: key fehlt.`);
      else if (artKeys.has(a.key)) errors.push(`${where}: key doppelt.`);
      else artKeys.add(a.key);
      if (!isText(a.name)) errors.push(`${where}: name fehlt.`);
      if (!numAtLeast(a.stueckpreis, 0)) errors.push(`${where}: stueckpreis muss eine Zahl ≥ 0 sein.`);
    }
    if (!artKeys.has('ohne')) errors.push('cello.arten: Art "ohne" fehlt.');
  }

  return errors;
}

// Lädt die Config und meldet, woher sie stammt:
// 'localStorage' (gültige gespeicherte Config), 'default' (nichts gespeichert)
// oder 'invalid-stored' (gespeicherte Config ungültig → Default aktiv,
// Original nach BACKUP_KEY gesichert, Fehlerliste in errors).
// Schema-Migration beim Laden: Wenn eine neue App-Version neue Settings kennt
// (z. B. 2.4.0: gcDickenAufschlag*), fehlen sie in älteren gespeicherten oder
// geteilten Ständen. Ohne diese Ergänzung würde jeder ältere Stand als
// „ungültig" abgelehnt — genau das blockierte am 10.08. das Zurücksetzen
// (roter Kasten in der Verwaltung + 409-Folgefehler). Fehlende Settings werden
// mit den Repo-Defaults aufgefüllt; alles andere bleibt unangetastet.
export function migratePricingConfig(config) {
  if (!config || typeof config !== 'object') return config;
  const settings = config.settings && typeof config.settings === 'object' ? config.settings : {};
  // Nur wirklich FEHLENDE Schlüssel auffüllen. Vorhandene, aber kaputte Werte
  // (z. B. der String "12" statt 12) bleiben stehen und fallen weiter laut in
  // der Validierung auf — sie still durch Defaults zu ersetzen würde mit
  // Zahlen rechnen, die niemand eingegeben hat.
  const missing = Object.keys(defaultConfig.settings).filter((key) => !(key in settings));
  let next = config;
  if (missing.length) {
    const filled = { ...settings };
    for (const key of missing) filled[key] = defaultConfig.settings[key];
    next = { ...next, settings: filled };
  }

  // Bug-Hunt V5 (M3-Folge): maxAuflage ist seit der gehärteten Validierung
  // Pflicht. Stände vor 2.3.0 (vor dem B1-Fix) tragen bei Kopp noch
  // `maxAuflage: null` = „unbegrenzt" — die Engine rechnete dort oberhalb der
  // höchsten Staffel mit eingefrorenem Verarbeitungspreis (genau der B1-Bug).
  // Damit solche Revisionen aus dem Verlauf weiter wiederherstellbar bleiben,
  // wird null/fehlend auf die höchste Staffel aufgefüllt, die in allen Zeilen
  // aller referenzierten Tabellen vorkommt. Kaputte Werte (0, Strings) bleiben
  // stehen und fallen in der Validierung auf.
  if (Array.isArray(next.routen)) {
    const routen = next.routen.map((route) => {
      if (!route || typeof route !== 'object' || route.maxAuflage != null) return route;
      const grenze = hoechsteGemeinsameStaffel(next.wvTabellen, route.wvTabelleRef);
      return grenze == null ? route : { ...route, maxAuflage: grenze };
    });
    if (routen.some((r, i) => r !== next.routen[i])) next = { ...next, routen };
  }
  return next;
}

// Höchste Auflagenstaffel, die in jeder Zeile jeder referenzierten WV-Tabelle
// vorkommt; null, wenn eine Tabelle fehlt oder unbrauchbar ist.
function hoechsteGemeinsameStaffel(wvTabellen, ref) {
  if (!wvTabellen || typeof wvTabellen !== 'object') return null;
  const namen = typeof ref === 'string' ? [ref] : ref && typeof ref === 'object' ? Object.values(ref) : [];
  if (!namen.length) return null;
  let grenze = Infinity;
  for (const name of namen) {
    const table = wvTabellen[name];
    if (!table || typeof table !== 'object') return null;
    const rows = Object.values(table);
    if (!rows.length) return null;
    for (const row of rows) {
      if (!row || typeof row !== 'object') return null;
      const staffeln = Object.keys(row).map(Number).filter((n) => Number.isInteger(n) && n >= 1);
      if (!staffeln.length) return null;
      grenze = Math.min(grenze, Math.max(...staffeln));
    }
  }
  return Number.isFinite(grenze) ? grenze : null;
}

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
    const parsed = migratePricingConfig(JSON.parse(raw));
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

// Persistiert nur gültige Configs — localStorage darf nie einen Stand enthalten,
// den loadPricingConfigResult wieder verwerfen müsste. Gibt zurück, ob gespeichert wurde.
export function savePricingConfig(config) {
  if (!validatePricingConfig(config).ok) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Quota/Privacy-Fehler bewusst schlucken — Config lebt dann nur im State
  }
  return true;
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

  const migrated = migratePricingConfig(parsed);
  const validation = validatePricingConfig(migrated);
  if (!validation.ok) {
    // Auch ein ungültiger Stand hat eine Revision — die braucht der Aufrufer,
    // damit ein anschließendes Veröffentlichen nicht mit baseRev 0 im
    // Schein-Konflikt (409) endet.
    return { config: null, source: 'invalid', errors: validation.errors, rev: configRev(parsed) };
  }

  savePricingConfig(migrated); // Offline-Cache aktualisieren
  return { config: migrated, source: 'shared', errors: [] };
}

// Verlauf der behaltenen Revisionen (Kurzübersicht) für die Verwaltung.
// Rückgabe: { ok, revisions: [{rev, version, stand, publishedAt}] } — neueste zuerst.
export async function fetchSharedHistory() {
  try {
    const response = await fetch(`${SHARED_API}?history=1`, {
      cache: 'no-store',
      headers: authHeaders(),
      signal: timeoutSignal(SHARED_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, revisions: [] };
    const body = await response.json();
    return { ok: true, revisions: Array.isArray(body?.revisions) ? body.revisions : [] };
  } catch {
    return { ok: false, revisions: [] };
  }
}

// Eine bestimmte Revision aus dem Verlauf laden (zum Wiederherstellen).
// Migration + Validierung wie beim normalen Laden; null bei Fehlern.
export async function fetchSharedRevision(rev) {
  try {
    const response = await fetch(`${SHARED_API}?rev=${encodeURIComponent(rev)}`, {
      cache: 'no-store',
      headers: authHeaders(),
      signal: timeoutSignal(SHARED_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const migrated = migratePricingConfig(await response.json());
    return validatePricingConfig(migrated).ok ? migrated : null;
  } catch {
    return null;
  }
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
  let publishedAt = new Date().toISOString();
  try {
    const body = await response.json();
    if (Number.isFinite(body?.rev)) rev = body.rev;
    if (typeof body?.publishedAt === 'string') publishedAt = body.publishedAt;
  } catch {
    // ohne Body: geschätzte Revision behalten
  }
  const stored = { ...config, meta: { ...config.meta, rev, publishedAt } };
  savePricingConfig(stored); // Offline-Cache aktualisieren
  return { ok: true, rev, publishedAt };
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
    // Wie beim geteilten Stand erst migrieren (M5): ein Pending aus einer
    // älteren App-Version würde sonst nach dem Deploy still verworfen.
    const parsed = migratePricingConfig(JSON.parse(raw));
    return validatePricingConfig(parsed).ok ? parsed : null;
  } catch {
    return null;
  }
}

// B3: Ein liegengebliebener Pending-Publish darf nur dann automatisch erneut
// veröffentlicht werden, wenn seine Basis-Revision noch dem geladenen geteilten
// Stand entspricht — sonst würde er stillschweigend fremde Veröffentlichungen
// überschreiben. Ohne geladenen geteilten Stand (noch nie veröffentlicht oder
// offline) darf der Versuch laufen: der Server lehnt eine veraltete baseRev
// ohnehin mit 409 ab, und der Konfliktfall wird dann sichtbar gemeldet.
export function canAutoPublishPending(pending, sharedConfig) {
  if (!pending) return false;
  if (!sharedConfig) return true;
  return configRev(pending) === configRev(sharedConfig);
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
