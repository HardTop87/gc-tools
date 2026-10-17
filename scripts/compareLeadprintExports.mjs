// Vergleicht zwei Leadprint-Export-Dateien desselben Artikels (z. B. vor und
// nach einem Import) und zeigt, welche Zellen außerhalb der Preiszeilen sich
// geändert haben — Prüfwerkzeug für den Testimport (T4: Teildatei darf nichts
// anderes verändern).
//   npx vite-node scripts/compareLeadprintExports.mjs vorher.xlsx nachher.xlsx
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { parseLeadprintExport } from '../src/utils/leadprintExportFile';

XLSX.set_fs(fs);
const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('Zwei Dateien angeben.'); process.exit(1); }
const lade = (f) => { const wb = XLSX.readFile(f); return parseLeadprintExport(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })); };
const A = lade(a), B = lade(b);
const key = (block) => String(block.header[0] ?? '');
const mapB = new Map(B.blocks.map((bl) => [key(bl), bl]));
let unterschiede = 0;
for (const bl of A.blocks) {
  const other = mapB.get(key(bl));
  if (!other) { console.log(`Block fehlt in ${b}: ${key(bl)}`); unterschiede += 1; continue; }
  if (bl.prefix === 'articlePrices') {
    console.log(`articlePrices: ${bl.rows.length} → ${other.rows.length} Zeilen, ${bl.header.length} → ${other.header.length} Spalten`);
    continue;
  }
  const cols = new Map(bl.header.map((h, i) => [String(h), i]));
  const colsB = new Map(other.header.map((h, i) => [String(h), i]));
  for (const [h, i] of cols) {
    const j = colsB.get(h);
    const va = bl.rows[0]?.[i] ?? null;
    const vb = j == null ? undefined : other.rows[0]?.[j] ?? null;
    if (j == null) { console.log(`  Spalte fehlt in ${b}: ${h}`); unterschiede += 1; }
    else if (String(va) !== String(vb) && !/\.mdate$/.test(h)) { console.log(`  ${h}: ${va} → ${vb}`); unterschiede += 1; }
  }
  for (const h of colsB.keys()) if (!cols.has(h)) { console.log(`  neue Spalte in ${b}: ${h}`); unterschiede += 1; }
}
for (const bl of B.blocks) if (!A.blocks.some((x) => key(x) === key(bl))) { console.log(`neuer Block in ${b}: ${key(bl)}`); unterschiede += 1; }
console.log(unterschiede ? `${unterschiede} Unterschiede außerhalb der Preiszeilen.` : 'Keine Unterschiede außerhalb der Preiszeilen.');
