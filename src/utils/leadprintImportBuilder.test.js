import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import mapping from '../data/leadprintMapping.rst.json';
import { getDefaultPricingConfig } from './pricingConfig';
import { calculateRSTPrice } from './calculateRSTPrice';
import { parseLeadprintExport, findBlock, blockToObjects } from './leadprintExportFile';
import { artikelKeyAusVorlage, buildImportMatrix, buildImportModel } from './leadprintImportBuilder';

const config = getDefaultPricingConfig();
const SEITEN = mapping.optionsfelder['Seitenanzahl Innenteil'].werte;

// Synthetische Vorlage mit der Spaltenbelegung des echten Exports vom
// 10.10.2026 (Artikel 1112051356, A4 Hoch 4/4 ohne Umschlag), auf das
// Wesentliche gekürzt. Die echten Dateien sind gitignoriert; der
// Integrationstest unten läuft nur, wenn sie lokal liegen.
function vorlage({ id = 1112051356, artikelnummer = 'BRO-RST-A4H-44', produktionszeit = 3, rabatt = 3, pt13453 = 1, feld5628 = 1 } = {}) {
  const seitenSpalten = Object.values(SEITEN).map((lw) => `articlePrices.dynopt_aa.5628.${lw}`);
  const preisHeader = [
    'articlePrices.id', 'articlePrices.bezeichnung', 'articlePrices.wert', 'articlePrices.preis',
    'articlePrices.sortiercode', 'articlePrices.wirkliches_gewicht', 'articlePrices.anzahl_pakete',
    'articlePrices.liefertage', 'articlePrices.artikelnummer', 'articlePrices.paper__id',
    'articlePrices.dynopt_aa.5555.16359', 'articlePrices.dynopt_aa.5555.16082',
    'articlePrices.dynopt_aa.5556.16085', 'articlePrices.dynopt_aa.5556.16086',
    'articlePrices.dynopt_aa.5559.16098', 'articlePrices.dynopt_aa.5559.16098.rai',
    'articlePrices.dynopt_aa.5559.16099', 'articlePrices.dynopt_aa.5559.16099.rai',
    'articlePrices.dynopt_aa.5560.53341', 'articlePrices.dynopt_aa.5560.53341.rai',
    'articlePrices.dynopt_aa.5561.16105', 'articlePrices.dynopt_aa.5561.16105.rai',
    'articlePrices.dynopt_aa.5561.16106', 'articlePrices.dynopt_aa.5561.16106.rai',
    'articlePrices.dynopt_aa.5562.16107', 'articlePrices.dynopt_aa.5562.bp', 'articlePrices.dynopt_aa.5562.16109',
    'articlePrices.dynopt_aa.5563.52314', 'articlePrices.dynopt_aa.5563.52314.rai',
    'articlePrices.dynopt_aa.5563.16136', 'articlePrices.dynopt_aa.5563.16136.rai',
    ...seitenSpalten,
    'articlePrices.dynopt_aa.12913.52310', 'articlePrices.dynopt_aa.12913.52310.rai',
    'articlePrices.dynopt_aa.12913.52311', 'articlePrices.dynopt_aa.12913.52311.rai',
    'articlePrices.dynopt_aa.12913.52312', 'articlePrices.dynopt_aa.12913.52312.rai',
    'articlePrices.dynopt_aa.12913.55105', 'articlePrices.dynopt_aa.12913.55105.rai',
  ];
  const referenz = preisHeader.map(() => 0);
  referenz[0] = 11630994; referenz[1] = '1 Stück'; referenz[2] = 1; referenz[3] = 10; referenz[4] = 10;
  referenz[6] = 1; referenz[9] = 1933; referenz[15] = 1112051233;
  const alteZeile = [...referenz]; alteZeile[0] = 11630995; alteZeile[1] = '10 Stück'; alteZeile[2] = 10; alteZeile[9] = 1970;
  const sorten = [1933, 1934, 1935, 1936, 1942, 1943, 1944, 1961, 1962, 1963, 1964, 3128, 6313, 6389, 1970, 1950];
  return [
    ['article.id', 'article.bezeichnung', 'article.artikelnummer', 'article.produktionszeit', 'article.glob_artikel_rabatt', 'article.unsichtbar'],
    [id, 'Rückstichheftung A4 Hoch 4/4', artikelnummer, produktionszeit, rabatt, 1],
    [],
    ['article_dynopt_au.13453', 'article_dynopt_au.13453.pt', 'article_dynopt_au.13453.55097', 'article_dynopt_au.13453.55099'],
    [1, pt13453, 0, 10],
    [],
    ['article_dynopt_au.5516', 'article_dynopt_au.5516.pt'],
    [0, 0],
    [],
    ['article_dynopt_aa.5628', 'article_dynopt_aa.5628.pt', 'article_dynopt_aa.5628.ide', 'article_dynopt_aa.5628.aif', 'article_dynopt_aa.5628.dpm'],
    [feld5628, 0, 1, 1, 0],
    [],
    ['article_dynopt_aa.5470', 'article_dynopt_aa.5470.pt'],
    [0, 0],
    [],
    ...[12913, 5561, 5559, 5560, 5563, 5556, 5555, 5562].flatMap((g) => [
      [`article_dynopt_aa.${g}`, `article_dynopt_aa.${g}.pt`, `article_dynopt_aa.${g}.ide`, `article_dynopt_aa.${g}.aif`, `article_dynopt_aa.${g}.dpm`],
      [1, 0, 1, 1, 0],
      [],
    ]),
    sorten.map((s) => `articleGlobalVariety.${s}`),
    sorten.map((s) => ([1933, 1970, 1950].includes(s) ? 1 : 0)),
    [],
    preisHeader,
    referenz,
    alteZeile,
  ];
}

function direkt(seiten, { auflage = 100, papier = 'CC_120', farbigkeit = '4c' } = {}) {
  const calc = calculateRSTPrice({
    formatKey: 'A4_Hoch', auflage, seiten, pInhaltId: papier, dInhaltKey: farbigkeit,
    hasUmschlag: false, pUmschlagId: '', dUmschlagKey: farbigkeit, celloUmschlag: 'ohne', produktionszeit: 'standard',
  }, config);
  const route = calc.validResults.find((r) => r.name === calc.recommendedName);
  return route ? route.gesamt : null;
}

describe('Leadprint-Import-Builder (ohne-Umschlag-Artikel)', () => {
  const { matrix, bericht } = buildImportMatrix({ templateMatrix: vorlage(), config, mapping, artikelKey: 'A4_Hoch|4c|ohne' });
  const model = parseLeadprintExport(matrix);
  const preise = blockToObjects(findBlock(model, 'articlePrices'));
  const zeile = (papierId, auflage) => preise.find((r) => r.paper__id === mapping.sorten[papierId].sortenId && r.wert === auflage);

  it('erkennt den Artikel an der ID der Vorlage', () => {
    expect(artikelKeyAusVorlage(vorlage(), mapping)).toBe('A4_Hoch|4c|ohne');
    expect(artikelKeyAusVorlage(vorlage({ id: 1 }), mapping)).toBeNull();
  });

  it('läuft ohne Fehler und Warnungen durch, wenn die Vorlage dem Zielzustand entspricht', () => {
    expect(bericht.fehler).toEqual([]);
    expect(bericht.warnungen).toEqual([]);
    expect(bericht.unbekannteGruppen).toEqual([]);
  });

  it('schreibt 13 Inhaltspapiere × 20 Staffeln, alle ohne ID (neu anlegen, alte löschen)', () => {
    expect(bericht.zeilen).toBe(13 * mapping.auflagen.length);
    expect(preise).toHaveLength(13 * mapping.auflagen.length);
    expect(preise.every((r) => r.id === null)).toBe(true);
    expect(preise.every((r) => r.anzahl_pakete === 1)).toBe(true); // aus der Referenzzeile übernommen
    expect(preise.map((r) => r.sortiercode)).toEqual(preise.map((_, i) => (i + 1) * 10));
    expect(zeile('CC_120', 100).bezeichnung).toBe('100 Stück');
  });

  it('Basispreis und Seitenaufschläge sind auf den Cent die Engine-Preise', () => {
    const z = zeile('CC_120', 100);
    const cent = (x) => Math.round(x * 100) / 100;
    expect(z.preis).toBe(cent(direkt(8)));
    for (const seiten of [12, 24, 44, 48]) {
      // Basis + Aufschlag = auf den Cent gerundeter Engine-Preis der Zelle
      expect(cent(z.preis + z[`dynopt_aa.5628.${SEITEN[seiten]}`])).toBe(cent(direkt(seiten)));
    }
    expect(z[`dynopt_aa.5628.${SEITEN[8]}`]).toBe(0);
  });

  it('nicht kalkulierbare Seitenzahlen und „4 Seiten" bleiben leer — nie 0 (D1, P3)', () => {
    const z = zeile('CC_160', 100); // dick: Partner-Limit 60 Seiten
    expect(z[`dynopt_aa.5628.${SEITEN[60]}`]).not.toBeNull();
    expect(z[`dynopt_aa.5628.${SEITEN[64]}`]).toBeNull();
    expect(z[`dynopt_aa.5628.${SEITEN[120]}`]).toBeNull();
    for (const r of preise) expect(r['dynopt_aa.5628.52313']).toBeNull();
    expect(bericht.leereZellen).toBeGreaterThan(0);
  });

  it('Weiterleitungen: eigener Wert 0 ohne Ziel, jeder Zwilling mit seiner Ziel-ID aus dem Mapping', () => {
    const id = (key) => mapping.artikel.find((a) => a.key === key).leadprintId;
    const z = zeile('N_80', 1);
    // Farbigkeit: 4/4 ist der eigene Artikel, 1/1 springt zum 1/1-Zwilling
    expect(z['dynopt_aa.5559.16099']).toBe(0);
    expect(z['dynopt_aa.5559.16099.rai']).toBeNull();
    expect(z['dynopt_aa.5559.16098']).toBe(0);
    expect(z['dynopt_aa.5559.16098.rai']).toBe(id('A4_Hoch|1c|ohne'));
    // Endformat: A4 eigen, alle anderen Formate springen zum gleichfarbigen ohne-U-Artikel
    expect(z['dynopt_aa.12913.52310']).toBe(0);
    expect(z['dynopt_aa.12913.52310.rai']).toBeNull();
    expect(z['dynopt_aa.12913.52311.rai']).toBe(id('A5_Hoch|4c|ohne'));
    expect(z['dynopt_aa.12913.52312.rai']).toBe(id('A5_Quer|4c|ohne'));
    expect(z['dynopt_aa.12913.55105.rai']).toBe(id('A6_Hoch|4c|ohne'));
    // Umschlag-Umschalter: „ohne" eigen, „4 Seiten" springt zum mit-U-Zwilling
    expect(z['dynopt_aa.5563.52314']).toBe(0);
    expect(z['dynopt_aa.5563.52314.rai']).toBeNull();
    expect(z['dynopt_aa.5563.16136']).toBe(0);
    expect(z['dynopt_aa.5563.16136.rai']).toBe(id('A4_Hoch|4c|mit'));
    // Alle 16 Live-Artikel haben IDs, also sind alle Weiterleitungen gesetzt
    // (Testartikel für den Umschlagartikel-Test dürfen ohne ID sein)
    expect(mapping.artikel.filter((a) => a.rolle !== 'test').every((a) => a.leadprintId)).toBe(true);
    expect(mapping.artikel.filter((a) => a.rolle !== 'test')).toHaveLength(16);
  });

  it('Zwilling ohne Leadprint-ID: Option bleibt leer UND wird im Bericht gemeldet — einmal je Ziel (M9)', () => {
    const ohneA6 = structuredClone(mapping);
    ohneA6.artikel.find((a) => a.key === 'A6_Hoch|4c|ohne').leadprintId = null;
    const { matrix: m2, bericht: b2 } = buildImportMatrix({ templateMatrix: vorlage(), config, mapping: ohneA6, artikelKey: 'A4_Hoch|4c|ohne' });
    const r = blockToObjects(findBlock(parseLeadprintExport(m2), 'articlePrices'))[0];
    expect(r['dynopt_aa.12913.55105']).toBeNull();
    expect(r['dynopt_aa.12913.55105.rai']).toBeNull();
    expect(b2.fehler).toEqual([]);
    // Weiterleitungs-Warnung genau einmal (nicht je Preiszeile × Spalte)
    const weiterleitung = b2.warnungen.filter((w) => w.startsWith('Weiterleitung Endformat/A6_Hoch:'));
    expect(weiterleitung).toHaveLength(1);
    expect(weiterleitung[0]).toContain('Zwilling A6_Hoch|4c|ohne hat keine leadprintId');
    // … und die Vollständigkeitsprüfung des Mappings meldet den Artikel ebenfalls
    expect(b2.warnungen).toContain('Mapping: Artikel A6_Hoch|4c|ohne: keine leadprintId im Mapping.');
  });

  it('Umschlag-Felder bleiben im ohne-U-Artikel leer; Bindung und Papier Innenteil: nur der gemappte Listenwert auf 0, alle anderen leer (M8)', () => {
    for (const r of preise) {
      expect(r['dynopt_aa.5555.16359']).toBeNull();
      expect(r['dynopt_aa.5556.16086']).toBeNull();
      expect(r['dynopt_aa.5562.16107']).toBeNull();
      expect(r['dynopt_aa.5562.bp']).toBeNull();
      // Drahtheftung 2-fach (16105) ist die RST-Bindung → 0 €, keine Weiterleitung
      expect(r['dynopt_aa.5561.16105']).toBe(0);
      expect(r['dynopt_aa.5561.16105.rai']).toBeNull();
      // Drahtheftung 4-fach (16106) steht nicht im Mapping → im Shop nicht wählbar
      expect(r['dynopt_aa.5561.16106']).toBeNull();
      expect(r['dynopt_aa.5561.16106.rai']).toBeNull();
      expect(r['dynopt_aa.5560.53341']).toBe(0);
      expect(r['dynopt_aa.5560.53341.rai']).toBeNull();
    }
  });

  it('Liefertage sind der Offset auf die Artikel-Produktionszeit: 0, in ILDA-Zeilen 1', () => {
    const offsets = new Set(preise.map((r) => r.liefertage));
    expect([...offsets].sort()).toEqual([0, 1]);
    for (const r of preise) {
      const istIlda = r.liefertage === 1;
      // Routen-Tag der Basiszelle ist unabhängig davon; der Offset kommt aus dem Zeilenmaximum
      expect(r.artikelnummer.startsWith('BRO-RST-A4H-44-')).toBe(true);
      if (istIlda) expect([100, 200, 300, 400, 500]).toContain(r.wert);
    }
    // Bei Produktionszeit 2 am Artikel wird der Offset entsprechend größer
    const { matrix: m2 } = buildImportMatrix({ templateMatrix: vorlage({ produktionszeit: 2 }), config, mapping, artikelKey: 'A4_Hoch|4c|ohne' });
    const p2 = blockToObjects(findBlock(parseLeadprintExport(m2), 'articlePrices'));
    expect([...new Set(p2.map((r) => r.liefertage))].sort()).toEqual([1, 2]);
  });

  it('Sorten-Flags: genau die 13 A4-Inhaltspapiere an, Fremdsorten aus', () => {
    const block = findBlock(model, 'articleGlobalVariety');
    const flags = Object.fromEntries(block.header.map((h, i) => [String(h).split('.')[1], block.rows[0][i]]));
    for (const p of ['N_80', 'CC_160', 'BD_170', 'R_80', 'R_100']) expect(flags[mapping.sorten[p].sortenId]).toBe(1);
    expect(flags[6389]).toBe(0); // R_90 nur A5 Hoch
    expect(flags[1970]).toBe(0); // Bilderdruck glänzend
    expect(flags[1950]).toBe(0); // PrimaSet
    expect(bericht.sortenAn).toHaveLength(13);
  });

  it('alle anderen Blöcke der Vorlage bleiben unverändert', () => {
    const orig = parseLeadprintExport(vorlage());
    expect(model.blocks.length).toBe(orig.blocks.length);
    orig.blocks.forEach((b, i) => {
      if (b.prefix === 'articlePrices' || b.prefix === 'articleGlobalVariety' || b.prefix === 'article') return;
      expect(model.blocks[i]).toEqual(b);
    });
    expect(findBlock(model, 'articlePrices').header).toEqual(findBlock(orig, 'articlePrices').header);
  });

  it('setzt Bezeichnung, Artikelnummer und Sichtbarkeit aus dem Mapping (Einstieg = 4/4 ohne Umschlag)', () => {
    const art = blockToObjects(findBlock(model, 'article.'))[0];
    expect(art.bezeichnung).toBe('Rückstichheftung A4 Hoch 4/4 ohne Umschlag');
    expect(art.artikelnummer).toBe('BRO-RST-A4H-44');
    expect(art.unsichtbar).toBe(0);
    expect(bericht.geaendert.some((g) => g.startsWith('bezeichnung'))).toBe(true);
    // 1/1 ist kein Einstiegsartikel → ausgeblendet
    const { model: m11 } = buildImportModel({ templateMatrix: vorlage({ id: 1112051233, artikelnummer: 'BRO-RST-A4H-11' }), config, mapping, artikelKey: 'A4_Hoch|1c|ohne' });
    const a11 = blockToObjects(findBlock(m11, 'article.'))[0];
    expect(a11.unsichtbar).toBe(1);
    expect(a11.bezeichnung).toBe('Rückstichheftung A4 Hoch 1/1 ohne Umschlag');
  });

  it('nurPreisbloecke: nur article.id, Sorten-Flags und Preiszeilen bleiben übrig', () => {
    const { model: klein, bericht: b } = buildImportModel({ templateMatrix: vorlage(), config, mapping, artikelKey: 'A4_Hoch|4c|ohne', nurPreisbloecke: true });
    expect(b.fehler).toEqual([]);
    expect(klein.blocks.map((x) => x.prefix)).toEqual(['article', 'articleGlobalVariety', 'articlePrices']);
    expect(klein.blocks[0].header).toEqual(['article.id']);
    expect(klein.blocks[0].rows).toEqual([[1112051356]]);
    expect(klein.blocks[2].rows).toHaveLength(13 * mapping.auflagen.length);
    expect(klein.blocks[2].header).toEqual(findBlock(model, 'articlePrices').header);
    // Artikel-Felder stehen nicht in der Minimaldatei → auch nicht im Bericht (N12)
    expect(b.geaendert).toEqual([]);
  });

  it('meldet Abweichungen der Vorlage vom Zielzustand als Warnungen, falsche Artikel-ID als Fehler', () => {
    const w = buildImportModel({ templateMatrix: vorlage({ pt13453: 0, feld5628: 0, rabatt: 5, artikelnummer: 'BRO-RST' }), config, mapping, artikelKey: 'A4_Hoch|4c|ohne' }).bericht;
    expect(w.fehler).toEqual([]);
    expect(w.warnungen.some((x) => x.includes('13453'))).toBe(true);
    expect(w.warnungen.some((x) => x.includes('Feld 5628'))).toBe(true);
    expect(w.warnungen.some((x) => x.includes('5 %'))).toBe(true);
    expect(w.geaendert.some((x) => x.includes('BRO-RST-A4H-44'))).toBe(true);
    const f = buildImportModel({ templateMatrix: vorlage({ id: 1112051233 }), config, mapping, artikelKey: 'A4_Hoch|4c|ohne' }).bericht;
    expect(f.fehler.some((x) => x.includes('1112051233'))).toBe(true);
    const m = buildImportModel({ templateMatrix: vorlage(), config, mapping, artikelKey: 'A4_Hoch|4c|mit' }).bericht;
    // alter mit-U-Artikel ohne festes Umschlagpapier: nicht baubar
    expect(m.fehler.some((x) => x.includes('umschlagPapier'))).toBe(true);
  });
});

const ECHT = {
  'A4_Hoch|1c|ohne': 'Leadprint_Export/export_1112051233_BRO_RST_A4H_11.xlsx',
  'A4_Hoch|4c|ohne': 'Leadprint_Export/export_1112051356_BRO_RST_A4H_44.xlsx',
};

describe.skipIf(!Object.values(ECHT).every((f) => fs.existsSync(f)))('Leadprint-Import-Builder gegen die echten Exporte vom 10.10.2026', () => {
  for (const [artikelKey, datei] of Object.entries(ECHT)) {
    it(`${artikelKey}: fehlerfrei, 260 Zeilen, Stichprobe exakt`, () => {
      const wb = XLSX.read(fs.readFileSync(datei));
      const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      expect(artikelKeyAusVorlage(matrix, mapping)).toBe(artikelKey);
      const { matrix: out, bericht } = buildImportMatrix({ templateMatrix: matrix, config, mapping, artikelKey });
      expect(bericht.fehler).toEqual([]);
      expect(bericht.warnungen).toEqual([]);
      expect(bericht.unbekannteGruppen).toEqual([]);
      expect(bericht.zeilen).toBe(260);
      const preise = blockToObjects(findBlock(parseLeadprintExport(out), 'articlePrices'));
      const farbigkeit = artikelKey.includes('|1c|') ? '1c' : '4c';
      const z = preise.find((r) => r.paper__id === mapping.sorten.N_80.sortenId && r.wert === 50);
      const cent = (x) => Math.round(x * 100) / 100;
      expect(z.preis).toBe(cent(direkt(8, { auflage: 50, papier: 'N_80', farbigkeit })));
      expect(cent(z.preis + z[`dynopt_aa.5628.${SEITEN[32]}`])).toBe(cent(direkt(32, { auflage: 50, papier: 'N_80', farbigkeit })));
      expect(z.liefertage).toBe(0);
      // Zwilling-Weiterleitung Farbigkeit
      const twin = mapping.artikel.find((a) => a.key === `A4_Hoch|${farbigkeit === '1c' ? '4c' : '1c'}|ohne`).leadprintId;
      const lw = farbigkeit === '1c' ? 16099 : 16098;
      expect(z[`dynopt_aa.5559.${lw}.rai`]).toBe(twin);
      // Bindung (M8): im echten Export 6 Listenwerte — nur Drahtheftung 2-fach bepreist
      for (const r of preise) {
        expect(r['dynopt_aa.5561.16105']).toBe(0);
        for (const lw5561 of [16106, 16133, 22731, 22732, 16134]) {
          expect(r[`dynopt_aa.5561.${lw5561}`]).toBeNull();
          expect(r[`dynopt_aa.5561.${lw5561}.rai`]).toBeNull();
        }
      }
    });
  }
});
