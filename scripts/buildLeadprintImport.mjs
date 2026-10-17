// Erzeugt Leadprint-Import-Dateien aus Export-Vorlagen.
//   npx vite-node scripts/buildLeadprintImport.mjs Leadprint_Export/export_1112051233_BRO_RST_A4H_11.xlsx [weitere…]
// Ausgabe: Leadprint_Import/import_<artikelId>_<artikelnummer>.xlsx + Bericht auf der Konsole.
// Preisbasis: src/data/pricingConfig.default.json (Repo-Standard). Für den
// veröffentlichten Stand aus der Verwaltung: --config <pfad-zur-json>.
// --minimal: nur article.id + Sorten-Flags + Preiszeilen (Testimport T4).
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import mapping from '../src/data/leadprintMapping.rst.json' with { type: 'json' };
import { getDefaultPricingConfig } from '../src/utils/pricingConfig';
import { artikelKeyAusVorlage, buildImportMatrix } from '../src/utils/leadprintImportBuilder';

XLSX.set_fs(fs);
const args = process.argv.slice(2);
let config = getDefaultPricingConfig();
let nurPreisbloecke = false;
const vorlagen = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--config') {
    const pfad = args[i + 1];
    if (!pfad || pfad.startsWith('--')) { console.error('--config braucht einen Pfad zur Preisstand-JSON (z. B. Export aus der Verwaltung).'); process.exit(1); }
    if (!fs.existsSync(pfad)) { console.error(`--config: Datei ${pfad} nicht gefunden.`); process.exit(1); }
    config = JSON.parse(fs.readFileSync(pfad, 'utf8'));
    i += 1;
  }
  else if (args[i] === '--minimal') nurPreisbloecke = true;
  else if (path.basename(args[i]).startsWith('~$')) console.error(`${args[i]}: Excel-Sperrdatei (Datei ist in Excel geöffnet) — übersprungen.`);
  else vorlagen.push(args[i]);
}
if (!vorlagen.length) { console.error('Keine Vorlage angegeben.'); process.exit(1); }
const outDir = path.resolve('Leadprint_Import');
fs.mkdirSync(outDir, { recursive: true });

let fehler = 0;
for (const vorlage of vorlagen) {
  const wb = XLSX.readFile(vorlage);
  const sheetName = wb.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
  const artikelKey = artikelKeyAusVorlage(matrix, mapping);
  if (!artikelKey) { console.error(`${vorlage}: Artikel-ID nicht im Mapping.`); fehler += 1; continue; }
  const { matrix: out, bericht } = buildImportMatrix({ templateMatrix: matrix, config, mapping, artikelKey, nurPreisbloecke });
  const artikel = mapping.artikel.find((a) => a.key === artikelKey);
  console.log(`\n== ${artikelKey} (${artikel.leadprintId}, ${artikel.artikelnummer}) aus ${path.basename(vorlage)}`);
  console.log(`   Preiszeilen ${bericht.zeilen}, Optionszellen ${bericht.zellen}, davon leer ${bericht.leereZellen}`);
  console.log(`   Sorten an: ${bericht.sortenAn.join(', ')}`);
  console.log(`   Sorten aus: ${bericht.sortenAus.length} (IDs ${bericht.sortenAus.join(', ')})`);
  if (bericht.unbekannteGruppen.length) console.log(`   unbekannte Optionsgruppen in Preiszeilen (bleiben leer): ${bericht.unbekannteGruppen.join(', ')}`);
  for (const g of bericht.geaendert) console.log(`   Artikel-Feld: ${g}`); // im --minimal-Modus leer (Datei trägt nur article.id)
  for (const w of bericht.warnungen) console.log(`   WARNUNG: ${w}`);
  for (const f of bericht.fehler) console.log(`   FEHLER: ${f}`);
  if (bericht.fehler.length) { fehler += 1; continue; }
  const ws = XLSX.utils.aoa_to_sheet(out);
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, sheetName);
  const ziel = path.join(outDir, `${nurPreisbloecke ? 'minimal' : 'import'}_${artikel.leadprintId}_${artikel.artikelnummer}.xlsx`);
  XLSX.writeFile(wbOut, ziel);
  console.log(`   → ${path.relative(process.cwd(), ziel)}`);
}
process.exit(fehler ? 1 : 0);
