// Erzeugt die Leadprint-Import-Dateien für den Umschlagartikel-Test
// (Umschlagartikel-Plan.md): Artikel werden per Mapping-Key gebaut, die
// Vorlage (Export eines bestehenden Artikels) wird explizit angegeben, weil
// Neuanlagen noch keine eigene Export-Datei haben.
//
//   npx vite-node scripts/buildTestUmschlag.mjs
//     → alle Artikel mit rolle "test" aus leadprintMapping.rst.json,
//       Vorlagen: A4 Hoch = export_1112127302_BRO_RST_A4H_44_U.xlsx (mit-U-Export,
//       hat die Spalten der Gruppen 5555/5556/5562), A5 Hoch = export_1112127304_…
//   Optionen:
//     --artikel <key>            nur diesen Mapping-Key bauen (mehrfach erlaubt)
//     --vorlage <export.xlsx>    Vorlage für alle Artikel
//     --vorlage <Format>=<export.xlsx>   Vorlage je Format (z. B. A5_Hoch=…)
//     --vorlagen-ordner <ordner> Stufe 2: je Artikel den EIGENEN Export aus diesem Ordner
//                                als Vorlage nehmen (Zuordnung über article.id = leadprintId);
//                                nur so werden die articlePrices.id der vorhandenen
//                                Staffelzeilen übernommen statt Dubletten anzulegen
//     --config <preisstand.json> Preisbasis statt pricingConfig.default.json
//     --out <ordner>             Ausgabeordner (Standard Leadprint_Import/test-umschlag)
//     --kein-zip                 ZIP nicht erzeugen
//     --ohne-huelle              rohe Engine-Preise an den Staffeln (Vergleich; Standard
//                                ist die Sicherheitshülle über die 151 Staffeln, Befund 1)
//
// Ausgabe: <out>/<artikelnummer>.xlsx je Artikel plus ein ZIP
// Leadprint_Import/test-umschlag-stufe<1|2>-<datum>.zip (Stufe 1 = mindestens ein
// Testartikel ohne ID → Neuanlage; Stufe 2 = alle IDs im Mapping → Update mit
// allen Weiterleitungen). Beide Stufen laufen mit demselben Code, nur das
// Mapping unterscheidet sich.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as XLSX from 'xlsx';
import mapping from '../src/data/leadprintMapping.rst.json' with { type: 'json' };
import { getDefaultPricingConfig } from '../src/utils/pricingConfig';
import { buildImportMatrix } from '../src/utils/leadprintImportBuilder';

XLSX.set_fs(fs);

const VORLAGEN_STANDARD = {
  A4_Hoch: 'Leadprint_Export/export_1112127302_BRO_RST_A4H_44_U.xlsx',
  A5_Hoch: 'Leadprint_Export/export_1112127304_BRO_RST_A5H_44_U.xlsx',
};

const args = process.argv.slice(2);
let config = getDefaultPricingConfig();
let outDir = path.resolve('Leadprint_Import', 'test-umschlag');
let zipErzeugen = true;
let huelle = true;
const keys = [];
const vorlagen = { ...VORLAGEN_STANDARD };
let vorlageAlle = null;
let vorlagenOrdner = null;
const wert = (i, was) => {
  const v = args[i + 1];
  if (!v || v.startsWith('--')) { console.error(`${args[i]} braucht ${was}.`); process.exit(1); }
  return v;
};
for (let i = 0; i < args.length; i += 1) {
  switch (args[i]) {
    case '--config': {
      const pfad = wert(i, 'einen Pfad zur Preisstand-JSON');
      if (!fs.existsSync(pfad)) { console.error(`--config: Datei ${pfad} nicht gefunden.`); process.exit(1); }
      config = JSON.parse(fs.readFileSync(pfad, 'utf8'));
      i += 1;
      break;
    }
    case '--artikel': keys.push(wert(i, 'einen Mapping-Key')); i += 1; break;
    case '--vorlage': {
      const v = wert(i, 'eine Export-Datei (oder Format=Datei)');
      const gleich = v.indexOf('=');
      if (gleich > 0 && !v.startsWith('/') && !v.startsWith('.')) vorlagen[v.slice(0, gleich)] = v.slice(gleich + 1);
      else vorlageAlle = v;
      i += 1;
      break;
    }
    case '--vorlagen-ordner': vorlagenOrdner = wert(i, 'einen Ordner mit Export-Dateien'); i += 1; break;
    case '--out': outDir = path.resolve(wert(i, 'einen Ordner')); i += 1; break;
    case '--kein-zip': zipErzeugen = false; break;
    case '--ohne-huelle': huelle = false; break;
    default: console.error(`Unbekannte Option ${args[i]}.`); process.exit(1);
  }
}

const artikel = keys.length
  ? keys.map((k) => mapping.artikel.find((a) => a.key === k) ?? { key: k, fehlt: true })
  : mapping.artikel.filter((a) => a.rolle === 'test');
if (!artikel.length) { console.error('Keine Artikel: weder --artikel noch Testartikel (rolle "test") im Mapping.'); process.exit(1); }

const matrixCache = new Map();
function ladeVorlage(pfad) {
  if (!matrixCache.has(pfad)) {
    const wb = XLSX.readFile(pfad);
    const sheetName = wb.SheetNames[0];
    matrixCache.set(pfad, { matrix: XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 }), sheetName });
  }
  return matrixCache.get(pfad);
}

// Eigener Export je Artikel (Stufe 2): Datei im Ordner, deren article.id zur leadprintId passt.
function eigeneVorlage(a) {
  if (!vorlagenOrdner || a.leadprintId == null) return null;
  for (const f of fs.readdirSync(vorlagenOrdner).filter((x) => x.endsWith('.xlsx') && !x.startsWith('~$'))) {
    const pfad = path.join(vorlagenOrdner, f);
    const { matrix } = ladeVorlage(pfad);
    const spalte = (matrix[0] ?? []).findIndex((h) => String(h) === 'article.id');
    if (spalte >= 0 && String(matrix[1]?.[spalte]) === String(a.leadprintId)) return pfad;
  }
  return null;
}

fs.mkdirSync(outDir, { recursive: true });
const dateien = [];
let fehler = 0;
let mappingHinweiseGezeigt = false;
for (const a of artikel) {
  if (a.fehlt) { console.error(`\n== ${a.key}: nicht im Mapping.`); fehler += 1; continue; }
  const eigene = eigeneVorlage(a);
  if (vorlagenOrdner && a.leadprintId != null && !eigene) console.log(`\n== ${a.key}: kein eigener Export in ${vorlagenOrdner} (article.id ${a.leadprintId}) — Format-Vorlage, Staffelzeilen ohne ID.`);
  const vorlagePfad = eigene ?? vorlageAlle ?? vorlagen[a.format];
  if (!vorlagePfad) { console.error(`\n== ${a.key}: keine Vorlage für Format ${a.format} (--vorlage ${a.format}=…).`); fehler += 1; continue; }
  if (!fs.existsSync(vorlagePfad)) { console.error(`\n== ${a.key}: Vorlage ${vorlagePfad} nicht gefunden.`); fehler += 1; continue; }
  const start = performance.now();
  const { matrix, sheetName } = ladeVorlage(vorlagePfad);
  const { matrix: out, bericht } = buildImportMatrix({ templateMatrix: matrix, config, mapping, artikelKey: a.key, huelle });
  const stufe = bericht.neuanlage ? 'Stufe 1: Neuanlage (article.id leer)' : `Stufe 2: Update von ${a.leadprintId}`;
  console.log(`\n== ${a.key} (${a.artikelnummer}) aus ${path.basename(vorlagePfad)} — ${stufe}${huelle ? '' : ' — OHNE Hülle'}`);
  console.log(`   Preiszeilen ${bericht.zeilen} (${bericht.zeilenMitId} mit Staffel-ID aus der Vorlage, ${bericht.zeilenNeu} neu), Optionszellen ${bericht.zellen}, davon leer ${bericht.leereZellen}`);
  console.log(`   Sorten an: ${bericht.sortenAn.join(', ')}`);
  console.log(`   Sorten aus: ${bericht.sortenAus.length} (IDs ${bericht.sortenAus.join(', ')})`);
  if (bericht.unbekannteGruppen.length) console.log(`   unbekannte Optionsgruppen in Preiszeilen (bleiben leer): ${bericht.unbekannteGruppen.join(', ')}`);
  for (const g of bericht.geaendert) console.log(`   Artikel-Feld: ${g}`);
  // Mapping-Hinweise (Testartikel ohne ID) gelten für alle Artikel gleich → nur einmal zeigen
  for (const h of bericht.hinweise) {
    if (h.startsWith('Mapping: ')) { if (mappingHinweiseGezeigt) continue; } else { /* artikelbezogen */ }
    console.log(`   Hinweis: ${h}`);
  }
  mappingHinweiseGezeigt = true;
  for (const w of bericht.warnungen) console.log(`   WARNUNG: ${w}`);
  for (const f of bericht.fehler) console.log(`   FEHLER: ${f}`);
  if (bericht.fehler.length) { fehler += 1; continue; }
  const ws = XLSX.utils.aoa_to_sheet(out);
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, sheetName);
  const ziel = path.join(outDir, `${a.artikelnummer}.xlsx`);
  XLSX.writeFile(wbOut, ziel);
  dateien.push({ ziel, neuanlage: bericht.neuanlage });
  console.log(`   → ${path.relative(process.cwd(), ziel)} (${(fs.statSync(ziel).size / 1024).toFixed(0)} KB, ${((performance.now() - start) / 1000).toFixed(1)} s)`);
}

if (zipErzeugen && dateien.length && !fehler) {
  const stufe = dateien.some((d) => d.neuanlage) ? 1 : 2;
  const datum = new Date().toISOString().slice(0, 10);
  const zip = path.join(path.dirname(outDir), `test-umschlag-stufe${stufe}-${datum}.zip`);
  if (fs.existsSync(zip)) fs.unlinkSync(zip);
  // zip -j: nur die Dateien, ohne Ordnerpfade — der Leadprint-Import liest nur die erste Ebene des Archivs
  execFileSync('zip', ['-j', '-q', zip, ...dateien.map((d) => d.ziel)], { stdio: 'inherit' });
  console.log(`\nZIP (Stufe ${stufe}, ${dateien.length} Dateien): ${path.relative(process.cwd(), zip)}`);
} else if (zipErzeugen && fehler) {
  console.log('\nKein ZIP: mindestens ein Artikel mit Fehlern.');
}
process.exit(fehler ? 1 : 0);
