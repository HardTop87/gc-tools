import defaultConfig from '../data/pricingConfig.default.json';

const STORAGE_KEY = 'gc_rst_pricingConfig';

export const REQUIRED_SETTINGS = [
  'baseGrundpreis1c',
  'baseGrundpreis4c',
  'dynFaktorBanner',
  'celloGrundkosten',
  'celloFaktorBanner',
  'setupKosten',
  'preferInternDelta',
  'preferKoppDelta',
  'expressFaktor',
  'gcUmschlagGrundkosten',
  'gcUmschlagStueckpreis',
  'gcUmschlagAbAuflage',
  'maxDickeGC',
  'maxDickePartner',
];

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
    if (!REQUIRED_SETTINGS.includes(r?.maxDickeRef)) errors.push(`${where}: maxDickeRef verweist nicht auf eine Einstellung.`);
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

export function loadPricingConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validatePricingConfig(parsed).ok) return parsed;
    }
  } catch {
    // localStorage nicht verfügbar oder korrupte Daten → Default
  }
  return getDefaultPricingConfig();
}

export function savePricingConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Quota/Privacy-Fehler bewusst schlucken — Config lebt dann nur im State
  }
}

export function resetPricingConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorieren
  }
  return getDefaultPricingConfig();
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
  const lines = [PAPER_CSV_HEADER.join(';')];
  for (const row of buildPaperPriceRows(config)) {
    lines.push(PAPER_CSV_HEADER.map((col) => String(row[col]).replace('.', ',')).join(';'));
  }
  return lines.join('\n');
}

function parseGermanNumber(value) {
  if (typeof value === 'number') return value;
  const parsed = parseFloat(String(value ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function parsePaperPriceCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!lines.length) return { rows: [], errors: ['CSV ist leer.'] };

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
  const idIdx = header.indexOf('id');
  const preisIdx = header.indexOf('preis_pro_1000');
  const dickeIdx = header.indexOf('dicke_um');
  if (idIdx === -1 || preisIdx === -1) {
    return { rows: [], errors: ['CSV benötigt mindestens die Spalten "id" und "preis_pro_1000".'] };
  }

  const rows = [];
  const errors = [];
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(delimiter);
    const id = (cells[idIdx] ?? '').trim();
    const preis = parseGermanNumber(cells[preisIdx]);
    if (!id) {
      errors.push(`Zeile ${i + 2}: id fehlt.`);
      return;
    }
    if (!(preis > 0)) {
      errors.push(`Zeile ${i + 2} (${id}): preis_pro_1000 muss eine Zahl > 0 sein.`);
      return;
    }
    const row = { id, preis_pro_1000: preis };
    if (dickeIdx !== -1 && String(cells[dickeIdx] ?? '').trim() !== '') {
      const dicke = parseGermanNumber(cells[dickeIdx]);
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
