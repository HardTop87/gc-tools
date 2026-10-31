// Prüft frische Leadprint-Exporte aller RST-Artikel, bevor daraus Importe
// gebaut werden. Referenz sind die beiden A4-Hoch-Artikel (1/1 und 4/4), von
// denen alle anderen kopiert wurden: Jede Abweichung in Artikel-Einstellungen
// und Feld-Flags wird gemeldet, dazu fehlende Spalten, die der Import braucht.
//   npx vite-node scripts/pruefeLeadprintExporte.mjs <export.xlsx …|ordner>
// Exit-Code 1, sobald eine Datei FEHLER hat (Hinweise zählen nicht).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import mapping from '../src/data/leadprintMapping.rst.json' with { type: 'json' };
import { getDefaultPricingConfig } from '../src/utils/pricingConfig';
import { blockToObjects, findBlock, parseLeadprintExport } from '../src/utils/leadprintExportFile';

XLSX.set_fs(fs);
const config = getDefaultPricingConfig();
// Referenzdateien relativ zum Repo (Script-Verzeichnis/..), nicht zum CWD
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENZ = {
  '1c': path.join(repoRoot, 'Leadprint_Export/export_1112051233_BRO_RST_A4H_11.xlsx'),
  '4c': path.join(repoRoot, 'Leadprint_Export/export_1112051356_BRO_RST_A4H_44.xlsx'),
};
// Felder, die sich je Artikel unterscheiden dürfen oder müssen — unsichtbar ist
// bewusst je Artikel anders (nur Einstiegsartikel sichtbar, setzt der Import)
const ERWARTET_ANDERS = new Set(['article.id', 'article.bezeichnung', 'article.artikelnummer', 'article.mdate', 'article.cdate', 'article.bezeichnung_url', 'article.unsichtbar']);
const FORMAT_NAME = { A4_Hoch: 'A4 Hoch', A5_Hoch: 'A5 Hoch', A5_Quer: 'A5 Quer', A6_Hoch: 'A6 Hoch' };

const lade = (datei) => {
  const wb = XLSX.readFile(datei);
  return parseLeadprintExport(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
};
const einstellungen = (model) => {
  const out = {};
  for (const b of model.blocks) {
    const kopf = String(b.header[0] ?? '');
    if (kopf.startsWith('article.') || kopf.startsWith('article_settings') || kopf.startsWith('article_dynopt_')) {
      b.header.forEach((h, i) => { if (h) out[String(h)] = b.rows[0]?.[i] ?? null; });
    }
  }
  return out;
};

let dateien = process.argv.slice(2);
if (dateien.length === 1 && fs.statSync(dateien[0]).isDirectory()) {
  dateien = fs.readdirSync(dateien[0]).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$')).map((f) => path.join(dateien[0], f));
}
for (const f of Object.values(REFERENZ)) {
  if (!fs.existsSync(f)) { console.error(`Referenzdatei fehlt: ${path.relative(process.cwd(), f)}`); process.exit(1); }
}
const referenz = { '1c': einstellungen(lade(REFERENZ['1c'])), '4c': einstellungen(lade(REFERENZ['4c'])) };
const gefunden = new Map();
const zusammenfassung = [];
let dateienMitFehlern = 0;

for (const datei of dateien) {
  const model = lade(datei);
  const e = einstellungen(model);
  const id = e['article.id'];
  const artikel = mapping.artikel.find((a) => String(a.leadprintId) === String(id));
  const fehler = [], hinweise = [];
  if (!artikel) {
    console.log(`\n== ${path.basename(datei)}: Artikel-ID ${id} ist keinem RST-Artikel zugeordnet.`);
    zusammenfassung.push([path.basename(datei), id, '?', 'FEHLER: ID unbekannt']);
    dateienMitFehlern += 1;
    continue;
  }
  if (gefunden.has(artikel.key)) fehler.push(`Doppelt: dieselbe Artikel-ID wie ${gefunden.get(artikel.key)}.`);
  gefunden.set(artikel.key, path.basename(datei));

  const sollName = `Rückstichheftung ${FORMAT_NAME[artikel.format]} ${artikel.farbigkeit === '1c' ? '1/1' : '4/4'} ${artikel.umschlag === 'mit' ? 'mit' : 'ohne'} Umschlag`;
  if (e['article.bezeichnung'] !== sollName) hinweise.push(`Bezeichnung „${e['article.bezeichnung']}", laut Tabelle „${sollName}".`);
  if (e['article.artikelnummer'] !== artikel.artikelnummer) fehler.push(`Artikelnummer „${e['article.artikelnummer']}", erwartet „${artikel.artikelnummer}".`);

  // Abweichungen gegenüber dem A4-Hoch-Artikel gleicher Farbigkeit
  const ref = referenz[artikel.farbigkeit];
  for (const [feld, wert] of Object.entries(e)) {
    if (ERWARTET_ANDERS.has(feld) || feld.startsWith('articleGlobalVariety')) continue;
    if (!(feld in ref)) { hinweise.push(`Feld ${feld} gibt es in der A4-Vorlage nicht (Wert ${wert}).`); continue; }
    if (String(wert ?? '').trim() !== String(ref[feld] ?? '').trim()) fehler.push(`${feld}: ${wert ?? 'leer'} (A4-Vorlage: ${ref[feld] ?? 'leer'})`);
  }
  for (const feld of Object.keys(ref)) if (!(feld in e) && !ERWARTET_ANDERS.has(feld)) fehler.push(`Feld ${feld} fehlt (in der A4-Vorlage vorhanden).`);

  // Spalten, die der Import braucht
  const preis = findBlock(model, 'articlePrices');
  const spalten = new Set((preis?.header ?? []).map(String));
  const brauche = (s) => { if (!spalten.has(`articlePrices.${s}`)) fehler.push(`Preisspalte ${s} fehlt.`); };
  const of = mapping.optionsfelder;
  for (const lw of Object.values(of.Endformat.werte)) { brauche(`dynopt_aa.12913.${lw}`); brauche(`dynopt_aa.12913.${lw}.rai`); }
  for (const lw of Object.values(of['Farbigkeit Innenteil'].werte)) { brauche(`dynopt_aa.5559.${lw}`); brauche(`dynopt_aa.5559.${lw}.rai`); }
  for (const lw of Object.values(of['Seitenanzahl Umschlag (RST)'].werte)) { brauche(`dynopt_aa.5563.${lw}`); brauche(`dynopt_aa.5563.${lw}.rai`); }
  for (const lw of Object.values(of['Seitenanzahl Innenteil'].werte)) brauche(`dynopt_aa.5628.${lw}`);
  if (artikel.umschlag === 'mit') {
    const format = config.formate.find((f) => f.key === artikel.format);
    for (const p of format.papiereUmschlag) brauche(`dynopt_aa.5555.${mapping.umschlagListenwerte[p].listenwertId}`);
    for (const lw of Object.values(of['Farbigkeit Umschlag (RST)'].werte)) brauche(`dynopt_aa.5556.${lw}`);
    for (const lw of Object.values(of['Veredelung Umschlag (RST)'].werte)) brauche(`dynopt_aa.5562.${lw}`);
  }
  const preiszeilen = preis ? blockToObjects(preis).length : 0;

  // Sorten: nur Info, der Import setzt sie aus der Config
  const sorten = blockToObjects(findBlock(model, 'articleGlobalVariety') ?? { header: [], rows: [] })[0] ?? {};
  const an = Object.entries(sorten).filter(([, v]) => Number(v) === 1).map(([k]) => Number(k));
  const soll = config.formate.find((f) => f.key === artikel.format).papiereInhalt.map((p) => mapping.sorten[p].sortenId);
  const zuviel = an.filter((s) => !soll.includes(s)), fehlt = soll.filter((s) => !an.includes(s));
  if (zuviel.length || fehlt.length) hinweise.push(`Sorten weichen vom Rechner ab (an statt aus: ${zuviel.join(', ') || '–'}; aus statt an: ${fehlt.join(', ') || '–'}). Der Import korrigiert das.`);

  console.log(`\n== ${artikel.key} · ${id} · ${path.basename(datei)} · ${preiszeilen} Preiszeilen`);
  for (const f of fehler) console.log(`   FEHLER: ${f}`);
  for (const h of hinweise) console.log(`   Hinweis: ${h}`);
  if (!fehler.length && !hinweise.length) console.log('   ok');
  if (fehler.length) dateienMitFehlern += 1;
  zusammenfassung.push([path.basename(datei), id, artikel.key, fehler.length ? `${fehler.length} Fehler` : 'ok', hinweise.length ? `${hinweise.length} Hinweise` : '']);
}
const fehlen = mapping.artikel.filter((a) => a.rolle !== 'test' && !gefunden.has(a.key)); // Testartikel haben (noch) keinen Export
console.log('\n== Zusammenfassung');
for (const z of zusammenfassung) console.log('  ', z.join(' | '));
if (fehlen.length) console.log(`   Keine Datei für: ${fehlen.map((a) => `${a.key} (${a.leadprintId})`).join(', ')}`);
if (dateienMitFehlern) console.log(`   ${dateienMitFehlern} Datei(en) mit Fehlern.`);
process.exit(dateienMitFehlern ? 1 : 0);
