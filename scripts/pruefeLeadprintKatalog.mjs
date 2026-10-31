// Gleicht Leadprint-Exporte mit dem Shop-Katalog (src/data/leadprintShop.json)
// ab: Welche Sorten-, Gruppen-, Listenwert- und Artikel-IDs tauchen in den
// Exporten auf, fehlen aber im Katalog (→ im Backend neu angelegt, Namen
// nachtragen)? Welche Katalog-Einträge kommen in keinem Export mehr vor
// (→ im Backend gelöscht?). Schreibt NICHTS — der Katalog wird von Hand
// gepflegt, weil Exporte keine Klarnamen enthalten.
//   npx vite-node scripts/pruefeLeadprintKatalog.mjs <export.xlsx …|ordner>
// Exit-Code 1, wenn Export-IDs im Katalog fehlen.
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import katalog from '../src/data/leadprintShop.json' with { type: 'json' };
import { parseLeadprintExport } from '../src/utils/leadprintExportFile';

XLSX.set_fs(fs);

let dateien = process.argv.slice(2);
if (!dateien.length) {
  console.error('Aufruf: npx vite-node scripts/pruefeLeadprintKatalog.mjs <export.xlsx …|ordner>');
  process.exit(2);
}
if (dateien.length === 1 && fs.statSync(dateien[0]).isDirectory()) {
  dateien = fs.readdirSync(dateien[0]).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$')).map((f) => path.join(dateien[0], f));
}

const exportSorten = new Set();
const exportGruppen = new Map(); // gruppenId → Set(listenwertId)
const exportArtikel = new Map(); // id → { bezeichnung, artikelnummer, datei }
for (const datei of dateien) {
  const wb = XLSX.readFile(datei);
  const { blocks } = parseLeadprintExport(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }));
  for (const b of blocks) {
    if (b.prefix === 'article') {
      const idx = (n) => b.header.indexOf(`article.${n}`);
      exportArtikel.set(String(b.rows[0][idx('id')]), {
        bezeichnung: b.rows[0][idx('bezeichnung')],
        artikelnummer: b.rows[0][idx('artikelnummer')],
        datei: path.basename(datei),
      });
    } else if (b.prefix === 'articleGlobalVariety') {
      for (const h of b.header) exportSorten.add(String(h).split('.')[1]);
    } else if (b.prefix === 'article_dynopt_au' || b.prefix === 'article_dynopt_aa') {
      // au-Gruppen tragen ihre Listenwerte hier (article_dynopt_au.<g>.<lw>)
      const g = String(b.header[0]).split('.')[1];
      if (!exportGruppen.has(g)) exportGruppen.set(g, new Set());
      for (const h of b.header.slice(1)) {
        const t = String(h).split('.');
        if (/^\d+$/.test(t[2] ?? '')) exportGruppen.get(g).add(t[2]);
      }
    } else if (b.prefix === 'articlePrices') {
      // aa-Gruppen tragen ihre Listenwerte als Preisspalten (articlePrices.dynopt_aa.<g>.<lw>[.rai])
      for (const h of b.header) {
        const t = String(h).split('.');
        if (t[1] === 'dynopt_aa' && /^\d+$/.test(t[3] ?? '')) {
          if (!exportGruppen.has(t[2])) exportGruppen.set(t[2], new Set());
          exportGruppen.get(t[2]).add(t[3]);
        }
      }
    }
  }
}

const katalogSorten = new Set(katalog.sorten.map((s) => String(s.id)));
const katalogGruppen = new Map(katalog.optionsfelder.map((o) => [String(o.id), o]));
const weitereGruppen = new Set((katalog.weitereOptionsgruppen ?? []).map((g) => String(g.id)));
const katalogArtikel = new Map(katalog.artikel.map((a) => [String(a.id), a]));
const abgeloest = new Map((katalog.abgeloesteArtikel ?? []).map((a) => [String(a.id), a]));

const fehlt = [];
const hinweise = [];

for (const id of exportSorten) if (!katalogSorten.has(id)) fehlt.push(`Sorte ${id}: im Export, nicht im Katalog — Name im Backend nachschlagen und eintragen.`);
for (const s of katalog.sorten) if (!exportSorten.has(String(s.id))) hinweise.push(`Sorte ${s.id} (${s.name}): in keinem Export — im Backend gelöscht?`);

for (const [g, lws] of exportGruppen) {
  const feld = katalogGruppen.get(g);
  if (!feld) {
    if (!weitereGruppen.has(g)) fehlt.push(`Optionsgruppe ${g}: im Export, nicht im Katalog (auch nicht unter weitereOptionsgruppen).`);
    continue;
  }
  const bekannt = new Set(feld.listenwerte.map((l) => String(l.id)));
  for (const lw of lws) if (!bekannt.has(lw)) fehlt.push(`Listenwert ${lw} in „${feld.name}“ (${g}): im Export, nicht im Katalog.`);
}
for (const [g, feld] of katalogGruppen) {
  if (!exportGruppen.has(g)) { hinweise.push(`Optionsfeld „${feld.name}“ (${g}): in keinem Export.`); continue; }
  for (const lw of feld.listenwerte) {
    if (lw.id != null && !exportGruppen.get(g).has(String(lw.id))) hinweise.push(`Listenwert ${lw.id} „${lw.name}“ (${feld.name}): in keinem Export.`);
  }
}

for (const [id, e] of exportArtikel) {
  const a = katalogArtikel.get(id);
  if (!a && abgeloest.has(id)) { hinweise.push(`Artikel ${id} (${e.datei}): abgelöst — ${abgeloest.get(id).hinweis}`); continue; }
  if (!a) fehlt.push(`Artikel ${id} „${e.bezeichnung}“ (${e.artikelnummer}, ${e.datei}): nicht im Katalog.`);
  else if (a.artikelnummer !== e.artikelnummer) fehlt.push(`Artikel ${id}: Artikelnummer im Export „${e.artikelnummer}“, im Katalog „${a.artikelnummer}“.`);
}

console.log(`${dateien.length} Export(e): ${exportArtikel.size} Artikel, ${exportSorten.size} Sorten, ${exportGruppen.size} Optionsgruppen.`);
if (fehlt.length) { console.log(`\nFEHLT IM KATALOG (${fehlt.length}):`); fehlt.forEach((m) => console.log('  - ' + m)); }
if (hinweise.length) { console.log(`\nHinweise (${hinweise.length}):`); hinweise.forEach((m) => console.log('  - ' + m)); }
if (!fehlt.length && !hinweise.length) console.log('Katalog und Exporte stimmen überein.');
process.exit(fehlt.length ? 1 : 0);
