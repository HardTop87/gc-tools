// Umschlagartikel-Test (Umschlagartikel-Plan.md, Stufe 1/2): Writer und Builder
// für Artikel mit festem Umschlagpapier und für den Test-Einstiegsartikel T-E.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import mapping from '../data/leadprintMapping.rst.json';
import { getDefaultPricingConfig } from './pricingConfig';
import { calculateRSTPrice } from './calculateRSTPrice';
import { parseLeadprintExport, findBlock, blockToObjects } from './leadprintExportFile';
import { buildImportMatrix, buildImportModel } from './leadprintImportBuilder';
import {
  buildPreiszeilenMitUmschlag,
  inhaltspapiereZuUmschlag,
  mappingHinweise,
  pruefeMappingVollstaendigkeit,
} from './leadprintWriter';

const config = getDefaultPricingConfig();
const SEITEN = mapping.optionsfelder['Seitenanzahl Innenteil'].werte;
const cent = (x) => Math.round(x * 100) / 100;
const TEST_KEYS = ['A4_Hoch|4c|ohne|TEST', 'A4_Hoch|4c|mit|CC_160', 'A4_Hoch|4c|mit|CC_250', 'A4_Hoch|4c|mit|CC_350', 'A4_Hoch|4c|mit|N_250', 'A5_Hoch|4c|mit|CC_250'];

// Mapping, wie es nach Stufe 1 aussieht: alle Testartikel haben ihre Shop-ID.
function mappingStufe2() {
  const m = structuredClone(mapping);
  TEST_KEYS.forEach((key, i) => { m.artikel.find((a) => a.key === key).leadprintId = 9000001 + i; });
  return m;
}
const idStufe2 = (key) => 9000001 + TEST_KEYS.indexOf(key);

// Synthetische Vorlage mit der vollständigen Spaltenbelegung des echten
// mit-U-Exports vom 10.10.2026 (Artikel 1112127302, 157 Preisspalten).
const PREIS_HEADER = [
  'id', 'artikel_rahmung__id', 'bezeichnung', 'wert', 'preis', 'sortiercode', 'wirkliches_gewicht', 'anzahl_pakete',
  'grossdruck_feste_groesse_jn', 'breite', 'hoehe', 'aufschlagFarbe', 'lange_seite', 'headline_jn', 'aufschlag_menge',
  'liefertage', 'artikelnummer', 'paper__id', 'nutzen', 'cad_qm', 'cad_ink_coverage_percent', 'serviceprovider',
  'individualPriceTable', 'shipping_exclusions',
  ...[16359, 16079, 16080, 16081, 16082, 16083, 16084, 16376, 55101, 16377, 16378, 16379, 16380, 55102, 55104]
    .flatMap((lw) => [`dynopt_aa.5555.${lw}`, `dynopt_aa.5555.${lw}.rai`]),
  ...[16085, 16086].flatMap((lw) => [`dynopt_aa.5556.${lw}`, `dynopt_aa.5556.${lw}.rai`]),
  ...[16098, 16099].flatMap((lw) => [`dynopt_aa.5559.${lw}`, `dynopt_aa.5559.${lw}.rai`]),
  'dynopt_aa.5560.53341', 'dynopt_aa.5560.53341.rai',
  ...[16105, 16106, 16133, 22731, 22732, 16134].flatMap((lw) => [`dynopt_aa.5561.${lw}`, `dynopt_aa.5561.${lw}.rai`]),
  'dynopt_aa.5562.16107', 'dynopt_aa.5562.16107.rai', 'dynopt_aa.5562.bp',
  ...[16109, 16108, 16110].flatMap((lw) => [`dynopt_aa.5562.${lw}`, `dynopt_aa.5562.${lw}.rai`]),
  ...[52314, 16136].flatMap((lw) => [`dynopt_aa.5563.${lw}`, `dynopt_aa.5563.${lw}.rai`]),
  ...Object.values(SEITEN).flatMap((lw) => [`dynopt_aa.5628.${lw}`, `dynopt_aa.5628.${lw}.rai`]),
  ...[52310, 52311, 52312, 55105].flatMap((lw) => [`dynopt_aa.12913.${lw}`, `dynopt_aa.12913.${lw}.rai`]),
].map((f) => `articlePrices.${f}`);

const SORTEN = [1932, 3128, 6389, 6313, 1933, 1934, 1935, 1936, 1942, 1943, 1944, 1947, 1950, 1961, 1962, 1963, 1964, 1970];

function vorlage({ id = 1112127302, artikelnummer = 'BRO-RST-A4H-44-U', produktionszeit = 3 } = {}) {
  const referenz = PREIS_HEADER.map(() => null);
  const setze = (feld, wert) => { referenz[PREIS_HEADER.indexOf(`articlePrices.${feld}`)] = wert; };
  setze('id', 19746384); setze('bezeichnung', '1 Stück'); setze('wert', 1); setze('preis', 25); setze('sortiercode', 610);
  setze('anzahl_pakete', 1); setze('liefertage', 0); setze('artikelnummer', 'BRO-RST-A4H-44-GC'); setze('paper__id', 1933);
  setze('dynopt_aa.5562.bp', 0); setze('dynopt_aa.5559.16098', 0); setze('dynopt_aa.5559.16098.rai', 1112051233);
  const artikelHeader = ['id', 'bezeichnung', 'bezeichnung_url', 'artikelnummer', 'produktionszeit', 'status', 'cdate', 'mdate',
    'unsichtbar', 'glob_artikel_rabatt', 'global_in_allen_subhops_ausblenden_jn'].map((f) => `article.${f}`);
  const artikelZeile = [id, 'Rückstichheftung A4 Hoch 4/4 mit Umschlag', null, artikelnummer, produktionszeit, 'OK', 1791748166, 1791748191, 1, 3, 1];
  return [
    artikelHeader,
    artikelZeile,
    [],
    ['article_dynopt_au.13453', 'article_dynopt_au.13453.pt', 'article_dynopt_au.13453.55097', 'article_dynopt_au.13453.55099'],
    [1, 1, 0, 10],
    [],
    ...[12913, 5561, 5563, 5628, 5556, 5555, 5559, 5560, 5562].flatMap((g) => [
      [`article_dynopt_aa.${g}`, `article_dynopt_aa.${g}.pt`, `article_dynopt_aa.${g}.ide`, `article_dynopt_aa.${g}.aif`, `article_dynopt_aa.${g}.dpm`],
      [1, 0, 1, 1, 0],
      [],
    ]),
    SORTEN.map((s) => `articleGlobalVariety.${s}`),
    SORTEN.map((s) => ([3128, 6313, 1933, 1934, 1935, 1936, 1942, 1943, 1944, 1961, 1962, 1963, 1964].includes(s) ? 1 : 0)),
    [],
    PREIS_HEADER,
    referenz,
  ];
}

function engine({ format = 'A4_Hoch', seiten, auflage, papier, umschlag = null, dU = '1c', cello = 'ohne', farbigkeit = '4c' }) {
  const calc = calculateRSTPrice({
    formatKey: format, auflage, seiten, pInhaltId: papier, dInhaltKey: farbigkeit,
    hasUmschlag: Boolean(umschlag), pUmschlagId: umschlag ?? '', dUmschlagKey: dU, celloUmschlag: cello, produktionszeit: 'standard',
  }, config);
  const route = calc.validResults.find((r) => r.name === calc.recommendedName);
  return route ? route.gesamt : null;
}

const STAFFELN = mapping.auflagen.length; // 151 (Raster B)

function baue(artikelKey, { m = mapping, tpl = vorlage(), nurPreisbloecke = false, huelle = true } = {}) {
  const { matrix, bericht } = buildImportMatrix({ templateMatrix: tpl, config, mapping: m, artikelKey, nurPreisbloecke, huelle });
  const model = parseLeadprintExport(matrix);
  const preise = findBlock(model, 'articlePrices') ? blockToObjects(findBlock(model, 'articlePrices')) : [];
  const art = blockToObjects(findBlock(model, 'article.'))[0];
  const flags = Object.fromEntries(findBlock(model, 'articleGlobalVariety').header.map((h, i) => [String(h).split('.')[1], findBlock(model, 'articleGlobalVariety').rows[0][i]]));
  const zeile = (papier, auflage) => preise.find((r) => r.paper__id === mapping.sorten[papier].sortenId && r.wert === auflage);
  return { matrix, model, bericht, preise, art, flags, zeile };
}

describe('Mapping: Testartikel für den Umschlagartikel-Test', () => {
  it('kennt die sechs Testartikel ohne ID, die Live-Artikel sind unverändert vollständig', () => {
    const test = mapping.artikel.filter((a) => a.rolle === 'test');
    expect(test.map((a) => a.key)).toEqual(TEST_KEYS);
    expect(test.every((a) => a.leadprintId === null && a.einstieg === false)).toBe(true);
    expect(test.filter((a) => a.umschlag === 'mit').every((a) => a.umschlagPapier)).toBe(true);
    expect(mapping.standardUmschlag).toEqual({ CC: 'CC_250', N: 'N_250' });
    // Vollständigkeitsprüfung bleibt leer (Testartikel ohne ID sind kein Fehler) …
    expect(pruefeMappingVollstaendigkeit(config, mapping)).toEqual([]);
    // … sondern ein Hinweis je Testartikel; nach Stufe 1 (IDs eingetragen) keiner mehr
    expect(mappingHinweise(mapping)).toHaveLength(6);
    expect(mappingHinweise(mapping)[0]).toContain('Testartikel A4_Hoch|4c|ohne|TEST ohne ID');
    expect(mappingHinweise(mappingStufe2())).toEqual([]);
  });

  it('prüft umschlagPapier und standardUmschlag gegen die Config', () => {
    const kaputt = structuredClone(mapping);
    kaputt.artikel.find((a) => a.key === 'A4_Hoch|4c|mit|CC_160').umschlagPapier = 'CC_999';
    kaputt.standardUmschlag.CC = 'N_250';
    const p = pruefeMappingVollstaendigkeit(config, kaputt);
    expect(p).toContain('Artikel A4_Hoch|4c|mit|CC_160: umschlagPapier CC_999 existiert nicht in der Config.');
    expect(p).toContain('standardUmschlag CC: Papier N_250 gehört zur Familie N.');
  });
});

describe('Leadprint-Writer: Preiszeilen eines Umschlagartikels', () => {
  it('Inhaltspapiere je Umschlag: Familienregel plus Ausnahme R_90 → CC_250 (A5 Hoch)', () => {
    expect(inhaltspapiereZuUmschlag(config, 'A4_Hoch', 'CC_160')).toEqual(['CC_100', 'CC_120', 'CC_160']);
    expect(inhaltspapiereZuUmschlag(config, 'A4_Hoch', 'N_250')).toEqual(['N_80', 'N_90', 'N_100', 'N_120']);
    expect(inhaltspapiereZuUmschlag(config, 'A5_Hoch', 'CC_250')).toEqual(['CC_100', 'CC_120', 'CC_160', 'R_90']);
    expect(inhaltspapiereZuUmschlag(config, 'A5_Hoch', 'CC_350')).toEqual([]); // in A5 Hoch nicht zugelassen
  });

  it('CC_160: 3 Papiere × 151 Staffeln, Basis = 4 Seiten / Umschlag 1/1 / ohne Cello, ohne Hülle Aufschläge exakt aus der Engine', () => {
    const { zeilen, probleme } = buildPreiszeilenMitUmschlag({ config, mapping, artikelKey: 'A4_Hoch|4c|mit|CC_160', huelle: false });
    expect(probleme).toEqual([]);
    expect(zeilen).toHaveLength(3 * STAFFELN);
    expect(STAFFELN).toBe(151);
    expect([...new Set(zeilen.map((z) => z.papierId))]).toEqual(['CC_100', 'CC_120', 'CC_160']);
    const z = zeilen.find((x) => x.papierId === 'CC_120' && x.auflage === 100);
    expect(z.sortenId).toBe(mapping.sorten.CC_120.sortenId);
    expect(z.umschlagPapier).toBe('CC_160');
    const e = (o) => engine({ papier: 'CC_120', auflage: 100, umschlag: 'CC_160', ...o });
    expect(z.preis).toBeCloseTo(e({ seiten: 4 }), 8);
    expect(z.aufschlaege[SEITEN[4]]).toBe(0);
    expect(z.aufschlaege[SEITEN[8]]).toBeCloseTo(e({ seiten: 8 }) - e({ seiten: 4 }), 8);
    expect(z.aufschlaege[SEITEN[24]]).toBeCloseTo(e({ seiten: 24 }) - e({ seiten: 4 }), 8);
    expect(z.aufschlagFarbigkeitUmschlag).toBeCloseTo(e({ seiten: 4, dU: '4c' }) - e({ seiten: 4 }), 8);
    expect(z.veredelungMoeglich).toBe(true);
    expect(z.aufschlaegeVeredelung.ohne).toBe(0);
    expect(z.aufschlaegeVeredelung.glaenzend).toBeCloseTo(e({ seiten: 4, cello: 'glaenzend' }) - e({ seiten: 4 }), 8);
    expect(z.aufschlaegeVeredelung.softtouch).toBeCloseTo(e({ seiten: 4, cello: 'softtouch' }) - e({ seiten: 4 }), 8);
    expect(z.artikelnummer).toBe('TEST-BRO-RST-A4H-44-U-CC160-GC');
    for (const x of zeilen) {
      expect(x.artikelnummer.startsWith('TEST-BRO-RST-A4H-44-U-CC160-')).toBe(true);
      expect(x.liefertage).toBeGreaterThanOrEqual(x.produktionszeitWT);
    }
    // Mit Hülle (Standard): gleiche Zeilen, jede Zelle ≥ roh, Routen/Liefertage gleich
    const mit = buildPreiszeilenMitUmschlag({ config, mapping, artikelKey: 'A4_Hoch|4c|mit|CC_160' });
    expect(mit.probleme).toEqual([]);
    expect(mit.zeilen).toHaveLength(zeilen.length);
    mit.zeilen.forEach((h, i) => {
      const r = zeilen[i];
      expect([h.papierId, h.auflage, h.route, h.liefertage, h.artikelnummer]).toEqual([r.papierId, r.auflage, r.route, r.liefertage, r.artikelnummer]);
      expect(h.preis).toBeGreaterThanOrEqual(r.preis - 1e-9);
      for (const lw of Object.keys(r.aufschlaege)) {
        if (r.aufschlaege[lw] === null) { expect(h.aufschlaege[lw]).toBeNull(); continue; }
        expect(h.preis + h.aufschlaege[lw]).toBeGreaterThanOrEqual(r.preis + r.aufschlaege[lw] - 1e-9);
      }
      expect(h.preis + h.aufschlagFarbigkeitUmschlag).toBeGreaterThanOrEqual(r.preis + r.aufschlagFarbigkeitUmschlag - 1e-9);
      expect(h.preis + h.aufschlaegeVeredelung.matt).toBeGreaterThanOrEqual(r.preis + r.aufschlaegeVeredelung.matt - 1e-9);
    });
    expect(mit.zeilen.some((h) => h.liftBasis > 0)).toBe(true);
  });

  it('N_250: Natur-Papiere, keine Veredelung (Cello nur CC/BD)', () => {
    const { zeilen, probleme } = buildPreiszeilenMitUmschlag({ config, mapping, artikelKey: 'A4_Hoch|4c|mit|N_250' });
    expect(probleme).toEqual([]);
    expect(zeilen).toHaveLength(4 * STAFFELN);
    expect(zeilen.every((z) => z.veredelungMoeglich === false)).toBe(true);
    expect(zeilen.every((z) => Object.keys(z.aufschlaegeVeredelung).length === 0)).toBe(true);
    // 4/4-Aufschlag ist nie leer; bei 1–10 Ex. (Kassen-Anker) kann er 0 sein
    expect(zeilen.every((z) => z.aufschlagFarbigkeitUmschlag != null && z.aufschlagFarbigkeitUmschlag >= 0)).toBe(true);
    expect(zeilen.find((z) => z.papierId === 'N_80' && z.auflage === 100).aufschlagFarbigkeitUmschlag).toBeGreaterThan(0);
  });

  it('alte mit-U-Artikel ohne festes Umschlagpapier und ohne-U-Artikel sind keine Umschlagartikel', () => {
    expect(buildPreiszeilenMitUmschlag({ config, mapping, artikelKey: 'A4_Hoch|4c|mit' }).probleme[0]).toContain('kein Umschlagartikel');
    expect(buildPreiszeilenMitUmschlag({ config, mapping, artikelKey: 'A4_Hoch|4c|ohne' }).probleme[0]).toContain('kein Umschlagartikel');
    expect(buildPreiszeilenMitUmschlag({ config, mapping, artikelKey: 'gibtsnicht' }).probleme[0]).toContain('nicht im Mapping');
  });
});

describe('Leadprint-Import-Builder: Umschlagartikel (Stufe 1, Neuanlage)', () => {
  const u1 = baue('A4_Hoch|4c|mit|CC_160');
  // Vergleichsbau ohne Hülle für die zellgenauen Engine-Vergleiche
  const u1roh = baue('A4_Hoch|4c|mit|CC_160', { huelle: false });

  it('läuft fehlerfrei, ohne Warnungen; Neuanlage aus fremder Vorlage wird als Hinweis gemeldet', () => {
    expect(u1.bericht.fehler).toEqual([]);
    expect(u1.bericht.warnungen).toEqual([]);
    expect(u1.bericht.unbekannteGruppen).toEqual([]);
    expect(u1.bericht.neuanlage).toBe(true);
    expect(u1.bericht.vorlageFremd).toBe(true);
    expect(u1.bericht.hinweise.some((h) => h.startsWith('Neuanlage: article.id bleibt leer'))).toBe(true);
    // Spaltenzahl und -reihenfolge der Vorlage bleiben erhalten
    expect(findBlock(u1.model, 'articlePrices').header).toEqual(PREIS_HEADER);
    expect(u1.matrix[0]).toEqual(vorlage()[0]);
  });

  it('Artikel-Felder: id leer, Bezeichnung/Artikelnummer aus dem Mapping, unsichtbar, OK, Subshop-Flag, 3 % PayPal, Datumsfelder leer', () => {
    expect(u1.art.id).toBeNull();
    expect(u1.art.bezeichnung).toBe('TEST Rückstichheftung A4 Hoch 4/4 mit Umschlag 160g ColorCopy');
    expect(u1.art.artikelnummer).toBe('TEST-BRO-RST-A4H-44-U-CC160');
    expect(u1.art.bezeichnung_url).toBeNull();
    expect(u1.art.status).toBe('OK');
    expect(u1.art.unsichtbar).toBe(1);
    expect(u1.art.global_in_allen_subhops_ausblenden_jn).toBe(1);
    expect(u1.art.glob_artikel_rabatt).toBe(3);
    expect(u1.art.cdate).toBeNull();
    expect(u1.art.mdate).toBeNull();
    expect(u1.art.produktionszeit).toBe(3); // aus der Vorlage übernommen
    expect(u1.bericht.geaendert.some((g) => g.startsWith('id:'))).toBe(true);
  });

  it('Sorten-Flags: nur die CC-Inhaltspapiere an, alle anderen aus', () => {
    for (const p of ['CC_100', 'CC_120', 'CC_160']) expect(u1.flags[mapping.sorten[p].sortenId]).toBe(1);
    for (const p of ['N_80', 'N_120', 'BD_115', 'BD_170', 'R_80', 'R_100', 'R_90']) expect(u1.flags[mapping.sorten[p].sortenId]).toBe(0);
    expect(u1.flags[1947]).toBe(0); // Umschlagsorte 250g CC ist keine Inhaltssorte
    expect(u1.bericht.sortenAn).toEqual(['CC_100', 'CC_120', 'CC_160']);
  });

  it('Preiszeilen: 453 Zeilen ohne ID (Neuanlage), Basis 4 Seiten = 0, Seitenaufschläge auf den Cent (ohne Hülle), Routen-Tag, Liefertage-Offset', () => {
    expect(u1.bericht.zeilen).toBe(3 * STAFFELN);
    expect(u1.bericht.zeilenMitId).toBe(0);
    expect(u1.preise.every((r) => r.id === null && r.anzahl_pakete === 1)).toBe(true);
    expect(u1.preise.map((r) => r.sortiercode)).toEqual(u1.preise.map((_, i) => (i + 1) * 10));
    expect(new Set(u1.preise.map((r) => `${r.paper__id}|${r.wert}`)).size).toBe(u1.preise.length);
    const z = u1roh.zeile('CC_120', 100);
    const e = (o) => engine({ papier: 'CC_120', auflage: 100, umschlag: 'CC_160', ...o });
    expect(z.bezeichnung).toBe('100 Stück');
    expect(z.preis).toBe(cent(e({ seiten: 4 })));
    expect(z['dynopt_aa.5628.52313']).toBe(0);
    expect(z['dynopt_aa.5628.52313.rai']).toBeNull();
    for (const seiten of [8, 12, 24, 44, 48]) {
      expect(cent(z.preis + z[`dynopt_aa.5628.${SEITEN[seiten]}`])).toBe(cent(e({ seiten })));
      expect(z[`dynopt_aa.5628.${SEITEN[seiten]}.rai`]).toBeNull();
    }
    // mit Hülle: dieselbe Zeile, nie unter der Engine
    const h = u1.zeile('CC_120', 100);
    expect(h.preis).toBeGreaterThanOrEqual(cent(e({ seiten: 4 })));
    for (const seiten of [8, 12, 24, 44, 48]) expect(cent(h.preis + h[`dynopt_aa.5628.${SEITEN[seiten]}`])).toBeGreaterThanOrEqual(cent(e({ seiten })));
    expect(z.artikelnummer).toBe('TEST-BRO-RST-A4H-44-U-CC160-GC');
    // dick: CC_160 Inhalt, Partner-Limit → hohe Seitenzahlen leer, nie 0
    const dick = u1.zeile('CC_160', 100);
    expect(dick[`dynopt_aa.5628.${SEITEN[120]}`]).toBeNull();
    // Liefertage-Offset auf article.produktionszeit (3): 0, ILDA-Zeilen 1
    expect([...new Set(u1.preise.map((r) => r.liefertage))].sort()).toEqual([0, 1]);
    const p2 = baue('A4_Hoch|4c|mit|CC_160', { tpl: vorlage({ produktionszeit: 2 }) });
    expect([...new Set(p2.preise.map((r) => r.liefertage))].sort()).toEqual([1, 2]);
  });

  it('Farbigkeit Umschlag: 1/1 = 0, 4/4 = Aufschlag auf den Cent; Veredelung: ohne 0, bp 0, Cello-Arten als Aufschlag (ohne Hülle exakt)', () => {
    const z = u1roh.zeile('CC_100', 500);
    const e = (o) => engine({ papier: 'CC_100', auflage: 500, umschlag: 'CC_160', seiten: 4, ...o });
    expect(z['dynopt_aa.5556.16085']).toBe(0);
    expect(z['dynopt_aa.5556.16085.rai']).toBeNull();
    expect(cent(z.preis + z['dynopt_aa.5556.16086'])).toBe(cent(e({ dU: '4c' })));
    expect(z['dynopt_aa.5556.16086.rai']).toBeNull();
    expect(z['dynopt_aa.5562.16107']).toBe(0);
    expect(z['dynopt_aa.5562.bp']).toBe(0);
    expect(cent(z.preis + z['dynopt_aa.5562.16109'])).toBe(cent(e({ cello: 'glaenzend' })));
    expect(cent(z.preis + z['dynopt_aa.5562.16108'])).toBe(cent(e({ cello: 'matt' })));
    expect(cent(z.preis + z['dynopt_aa.5562.16110'])).toBe(cent(e({ cello: 'softtouch' })));
    expect(z['dynopt_aa.5562.16109.rai']).toBeNull();
  });

  it('Papier Umschlag: eigenes Papier 0 ohne Ziel; Geschwister ohne ID bleiben leer (Hinweis); unpassende und nicht angelegte Papiere leer', () => {
    for (const z of u1.preise) {
      expect(z['dynopt_aa.5555.16082']).toBe(0); // CC_160 eigen
      expect(z['dynopt_aa.5555.16082.rai']).toBeNull();
      expect(z['dynopt_aa.5555.16084']).toBeNull(); // CC_250: Testartikel, ID erst nach Stufe 1
      expect(z['dynopt_aa.5555.16084.rai']).toBeNull();
      expect(z['dynopt_aa.5555.55101']).toBeNull(); // CC_350: ebenso
      expect(z['dynopt_aa.5555.16083']).toBeNull(); // CC_200: kein Testartikel
      expect(z['dynopt_aa.5555.16080']).toBeNull(); // N_250: passt nicht zu CC-Inhalt
      expect(z['dynopt_aa.5555.16080.rai']).toBeNull();
      expect(z['dynopt_aa.5555.16377']).toBeNull(); // BD_170
    }
    const h = u1.bericht.hinweise.filter((x) => x.startsWith('Weiterleitung Papier Umschlag (RST)/'));
    expect(h).toHaveLength(2);
    expect(h[0]).toContain('CC_250 → A4_Hoch|4c|mit|CC_250: Testartikel ohne ID');
  });

  it('Seitenanzahl Umschlag, Endformat, Farbigkeit Innenteil, Bindung, Papier Innenteil', () => {
    for (const z of u1.preise) {
      expect(z['dynopt_aa.5563.16136']).toBe(0); // 4 Seiten = eigener Zustand
      expect(z['dynopt_aa.5563.16136.rai']).toBeNull();
      expect(z['dynopt_aa.5563.52314']).toBeNull(); // ohne Umschlag → T-E, noch ohne ID
      expect(z['dynopt_aa.5563.52314.rai']).toBeNull();
      expect(z['dynopt_aa.12913.52310']).toBe(0); // A4 eigen
      expect(z['dynopt_aa.12913.52310.rai']).toBeNull();
      expect(z['dynopt_aa.12913.52311']).toBeNull(); // A5 Hoch mit CC_160 gibt es nicht
      expect(z['dynopt_aa.12913.52312']).toBeNull();
      expect(z['dynopt_aa.12913.55105']).toBeNull();
      expect(z['dynopt_aa.5559.16099']).toBe(0); // 4/4 eigen
      expect(z['dynopt_aa.5559.16098']).toBeNull(); // 1/1-Zwilling existiert nicht
      expect(z['dynopt_aa.5559.16098.rai']).toBeNull();
      expect(z['dynopt_aa.5561.16105']).toBe(0);
      for (const lw of [16106, 16133, 22731, 22732, 16134]) expect(z[`dynopt_aa.5561.${lw}`]).toBeNull();
      expect(z['dynopt_aa.5560.53341']).toBe(0);
      expect(z['dynopt_aa.5560.53341.rai']).toBeNull();
    }
    expect(u1.bericht.hinweise.some((x) => x.includes('Seitenanzahl Umschlag (RST)/ohne → A4_Hoch|4c|ohne|TEST'))).toBe(true);
  });

  it('N_250: Veredelung komplett leer (auch bp), nur N-Inhaltspapiere, nur eigener Umschlag bepreist', () => {
    const n = baue('A4_Hoch|4c|mit|N_250');
    expect(n.bericht.fehler).toEqual([]);
    expect(n.bericht.zeilen).toBe(4 * STAFFELN);
    expect(n.bericht.sortenAn).toEqual(['N_80', 'N_90', 'N_100', 'N_120']);
    for (const z of n.preise) {
      expect(z['dynopt_aa.5562.16107']).toBeNull();
      expect(z['dynopt_aa.5562.bp']).toBeNull();
      expect(z['dynopt_aa.5562.16109']).toBeNull();
      expect(z['dynopt_aa.5555.16080']).toBe(0); // N_250 eigen
      expect(z['dynopt_aa.5555.16082']).toBeNull(); // CC_160 passt nicht zu N
      expect(z['dynopt_aa.5555.16079']).toBeNull(); // N_200: kein Testartikel
      expect(z['dynopt_aa.5556.16086']).toBeGreaterThanOrEqual(0);
    }
    expect(n.zeile('N_80', 100)['dynopt_aa.5556.16086']).toBeGreaterThan(0);
  });

  it('A5 Hoch CC_250: R_90 ist über die Ausnahme dabei, Endformat A4 zeigt auf den A4-CC_250-Artikel (Stufe 1 leer)', () => {
    const a5 = baue('A5_Hoch|4c|mit|CC_250', { tpl: vorlage({ id: 1112127304, artikelnummer: 'BRO-RST-A5H-44-U' }) });
    expect(a5.bericht.fehler).toEqual([]);
    expect([...a5.bericht.sortenAn].sort()).toEqual(['CC_100', 'CC_120', 'CC_160', 'R_90']);
    expect(a5.bericht.zeilen).toBe(4 * STAFFELN);
    const r90 = a5.zeile('R_90', 100);
    expect(r90.preis).toBeGreaterThanOrEqual(cent(engine({ format: 'A5_Hoch', papier: 'R_90', auflage: 100, umschlag: 'CC_250', seiten: 4 })));
    expect(r90['dynopt_aa.5555.16084']).toBe(0); // CC_250 eigen
    expect(r90['dynopt_aa.5555.16080']).toBeNull(); // N_250 passt zu R_90, aber kein A5-Testartikel
    expect(r90['dynopt_aa.5555.16082']).toBeNull(); // CC_160 passt NICHT zu R_90 (Ausnahme nur CC_250/N_250)
    expect(r90['dynopt_aa.12913.52311']).toBe(0);
    expect(r90['dynopt_aa.12913.52310']).toBeNull();
    expect(a5.bericht.hinweise.some((x) => x.includes('Endformat/A4_Hoch → A4_Hoch|4c|mit|CC_250'))).toBe(true);
  });

  it('Vorlage ohne Umschlag-Spalten ist für einen Umschlagartikel ein Fehler; Minimaldatei bei Neuanlage ebenso', () => {
    const ohneUmschlagSpalten = vorlage().map((row) => {
      const i = row.findIndex((h) => String(h).startsWith('articlePrices.'));
      if (i < 0) return row;
      const behalten = row.map((_, k) => !String(PREIS_HEADER[k]).includes('dynopt_aa.5556.'));
      return row.filter((_, k) => behalten[k]);
    });
    const f = buildImportModel({ templateMatrix: ohneUmschlagSpalten, config, mapping, artikelKey: 'A4_Hoch|4c|mit|CC_160' }).bericht;
    expect(f.fehler.some((x) => x.includes('Gruppe 5556'))).toBe(true);
    const min = baue('A4_Hoch|4c|mit|CC_160', { nurPreisbloecke: true });
    expect(min.bericht.fehler.some((x) => x.includes('Neuanlage'))).toBe(true);
  });
});

describe('Leadprint-Import-Builder: Umschlagartikel (Stufe 2, IDs im Mapping)', () => {
  const m2 = mappingStufe2();
  const u2 = baue('A4_Hoch|4c|mit|CC_250', { m: m2 });

  it('Update: article.id = eigene ID (fremde Vorlage nur mit Warnung), alle Weiterleitungen gefüllt, keine Hinweise auf fehlende IDs', () => {
    expect(u2.bericht.fehler).toEqual([]);
    expect(u2.bericht.neuanlage).toBe(false);
    expect(u2.art.id).toBe(idStufe2('A4_Hoch|4c|mit|CC_250'));
    expect(u2.art.status).toBe('OK');
    expect(u2.bericht.warnungen).toEqual([`Vorlage gehört zu Artikel 1112127302, article.id wird auf ${idStufe2('A4_Hoch|4c|mit|CC_250')} gesetzt (Testartikel, Stufe 2 mit fremder Vorlage).`]);
    expect(u2.bericht.hinweise.some((h) => h.includes('ohne ID'))).toBe(false);
    for (const z of u2.preise) {
      expect(z['dynopt_aa.5555.16084']).toBe(0); // eigen
      expect(z['dynopt_aa.5555.16084.rai']).toBeNull();
      expect(z['dynopt_aa.5555.16082']).toBe(0); // CC_160
      expect(z['dynopt_aa.5555.16082.rai']).toBe(idStufe2('A4_Hoch|4c|mit|CC_160'));
      expect(z['dynopt_aa.5555.55101']).toBe(0); // CC_350
      expect(z['dynopt_aa.5555.55101.rai']).toBe(idStufe2('A4_Hoch|4c|mit|CC_350'));
      expect(z['dynopt_aa.5555.16080']).toBeNull(); // N_250 passt nicht zu CC
      expect(z['dynopt_aa.5563.52314']).toBe(0); // ohne Umschlag → T-E
      expect(z['dynopt_aa.5563.52314.rai']).toBe(idStufe2('A4_Hoch|4c|ohne|TEST'));
      expect(z['dynopt_aa.12913.52311']).toBe(0); // A5 Hoch CC_250
      expect(z['dynopt_aa.12913.52311.rai']).toBe(idStufe2('A5_Hoch|4c|mit|CC_250'));
      expect(z['dynopt_aa.12913.52312']).toBeNull(); // A5 Quer: kein Testartikel
      expect(z['dynopt_aa.5559.16098']).toBeNull(); // kein 1/1-Test-Zwilling
    }
  });

  it('mit eigenem Export als Vorlage: kein Warnhinweis, Datumsfelder bleiben, Staffel-ID der Vorlagenzeile wird übernommen', () => {
    const eigene = baue('A4_Hoch|4c|mit|CC_250', { m: m2, tpl: vorlage({ id: idStufe2('A4_Hoch|4c|mit|CC_250'), artikelnummer: 'TEST-BRO-RST-A4H-44-U-CC250' }) });
    expect(eigene.bericht.fehler).toEqual([]);
    expect(eigene.bericht.warnungen).toEqual([]);
    expect(eigene.bericht.vorlageFremd).toBe(false);
    expect(eigene.art.cdate).toBe(1791748166);
    expect(eigene.art.id).toBe(idStufe2('A4_Hoch|4c|mit|CC_250'));
    // Die einzige Vorlagenzeile ist Sorte 1933 (N_80) × 1 Stück — kein CC-Inhaltspapier,
    // also nicht in der Datei (der Import löscht die Staffel), keine ID übernommen
    expect(eigene.bericht.zeilenMitId).toBe(0);
    expect(eigene.bericht.vorlagenzeilenEntfallen).toBe(1);
    expect(eigene.preise.every((r) => r.id === null)).toBe(true);
    // Beim N_250-Artikel ist N_80 aktiv → die Staffel-ID 19746384 bleibt an N_80 × 1
    const n250 = baue('A4_Hoch|4c|mit|N_250', { m: m2, tpl: vorlage({ id: idStufe2('A4_Hoch|4c|mit|N_250'), artikelnummer: 'TEST-BRO-RST-A4H-44-U-N250' }) });
    expect(n250.bericht.vorlageFremd).toBe(false);
    expect(n250.zeile('N_80', 1).id).toBe(19746384);
    expect(n250.bericht.zeilenMitId).toBe(1);
    expect(n250.bericht.zeilenNeu).toBe(4 * STAFFELN - 1);
    expect(n250.preise.filter((r) => r.id !== null)).toHaveLength(1);
    // fremde Vorlage (u2): keine ID übernommen
    expect(u2.preise.every((r) => r.id === null)).toBe(true);
    expect(u2.bericht.zeilenMitId).toBe(0);
  });

  it('Testartikel verweisen nie auf Live-Artikel und Live-Artikel nie auf Testartikel', () => {
    // T-U1 „ohne Umschlag" → T-E, nicht der Live-Artikel 1112051356
    const ids = new Set(u2.preise.flatMap((z) => Object.entries(z).filter(([k, v]) => k.endsWith('.rai') && v != null).map(([, v]) => v)));
    for (const id of ids) expect(id).toBeGreaterThanOrEqual(9000001);
    // Live-Einstiegsartikel: „4 Seiten" springt weiter zum alten mit-U-Zwilling, nicht zu TEST-CC_250
    const live = baue('A4_Hoch|4c|ohne', { m: m2, tpl: vorlage({ id: 1112051356, artikelnummer: 'BRO-RST-A4H-44' }) });
    expect(live.bericht.fehler).toEqual([]);
    expect(live.preise.every((z) => z['dynopt_aa.5563.16136.rai'] === 1112127302)).toBe(true);
    expect(live.art.id).toBe(1112051356);
  });
});

describe('Leadprint-Import-Builder: Test-Einstiegsartikel T-E (ohne Umschlag)', () => {
  const te = baue('A4_Hoch|4c|ohne|TEST');

  it('ist ein normaler ohne-U-Artikel als Neuanlage: 13 Papiere × 151 Staffeln, Basis 8 Seiten, 4 Seiten leer', () => {
    expect(te.bericht.fehler).toEqual([]);
    expect(te.bericht.warnungen).toEqual([]);
    expect(te.bericht.zeilen).toBe(13 * STAFFELN);
    expect(te.preise.every((r) => r.id === null)).toBe(true);
    expect(te.art.id).toBeNull();
    expect(te.art.bezeichnung).toBe('TEST Rückstichheftung A4 Hoch 4/4 ohne Umschlag');
    expect(te.art.artikelnummer).toBe('TEST-BRO-RST-A4H-44');
    expect(te.art.unsichtbar).toBe(1); // kein Einstiegsartikel im Sinne der Warengruppenliste
    expect(te.art.status).toBe('OK');
    const z = te.zeile('CC_120', 100);
    expect(z.preis).toBeGreaterThanOrEqual(cent(engine({ papier: 'CC_120', auflage: 100, seiten: 8, dU: '4c' })));
    expect(z['dynopt_aa.5628.52313']).toBeNull();
    expect(z.artikelnummer).toBe('TEST-BRO-RST-A4H-44-GC');
    for (const r of te.preise) {
      expect(r['dynopt_aa.5555.16082']).toBeNull();
      expect(r['dynopt_aa.5556.16086']).toBeNull();
      expect(r['dynopt_aa.5562.bp']).toBeNull();
    }
  });

  it('„4 Seiten" (mit Umschlag) je Zeile: CC → T-U2 (CC_250), N → T-U4 (N_250), BD und R leer; Format/Farbigkeit ohne Test-Zwillinge leer', () => {
    // Stufe 1: Ziele ohne ID → Zellen leer, Hinweis je Familie
    for (const r of te.preise) {
      expect(r['dynopt_aa.5563.52314']).toBe(0);
      expect(r['dynopt_aa.5563.16136']).toBeNull();
      expect(r['dynopt_aa.5563.16136.rai']).toBeNull();
      expect(r['dynopt_aa.12913.52311']).toBeNull();
      expect(r['dynopt_aa.12913.52311.rai']).toBeNull();
      expect(r['dynopt_aa.5559.16098']).toBeNull();
    }
    expect(te.bericht.hinweise.some((h) => h.includes('mit (CC → CC_250) → A4_Hoch|4c|mit|CC_250'))).toBe(true);
    expect(te.bericht.hinweise.some((h) => h.includes('mit (N → N_250) → A4_Hoch|4c|mit|N_250'))).toBe(true);
    // Stufe 2: IDs gesetzt → rai je Papierfamilie
    const te2 = baue('A4_Hoch|4c|ohne|TEST', { m: mappingStufe2() });
    expect(te2.bericht.fehler).toEqual([]);
    const ziel = (papier) => te2.zeile(papier, 100)['dynopt_aa.5563.16136.rai'];
    expect(te2.zeile('CC_120', 100)['dynopt_aa.5563.16136']).toBe(0);
    expect(ziel('CC_100')).toBe(idStufe2('A4_Hoch|4c|mit|CC_250'));
    expect(ziel('CC_160')).toBe(idStufe2('A4_Hoch|4c|mit|CC_250'));
    expect(ziel('N_80')).toBe(idStufe2('A4_Hoch|4c|mit|N_250'));
    expect(ziel('N_120')).toBe(idStufe2('A4_Hoch|4c|mit|N_250'));
    expect(te2.zeile('BD_135', 100)['dynopt_aa.5563.16136']).toBeNull();
    expect(ziel('BD_135')).toBeNull();
    expect(ziel('R_80')).toBeNull();
    expect(te2.zeile('R_80', 100)['dynopt_aa.12913.52311.rai']).toBeNull();
  });
});

const VORLAGEN = {
  A4_Hoch: 'Leadprint_Export/export_1112127302_BRO_RST_A4H_44_U.xlsx',
  A5_Hoch: 'Leadprint_Export/export_1112127304_BRO_RST_A5H_44_U.xlsx',
};

describe.skipIf(!Object.values(VORLAGEN).every((f) => fs.existsSync(f)))('Umschlagartikel gegen die echten mit-U-Exporte vom 10.10.2026', () => {
  const lade = (f) => { const wb = XLSX.read(fs.readFileSync(f)); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); };
  const erwartet = { 'A4_Hoch|4c|ohne|TEST': 13, 'A4_Hoch|4c|mit|CC_160': 3, 'A4_Hoch|4c|mit|CC_250': 3, 'A4_Hoch|4c|mit|CC_350': 3, 'A4_Hoch|4c|mit|N_250': 4, 'A5_Hoch|4c|mit|CC_250': 4 };
  for (const [artikelKey, sorten] of Object.entries(erwartet)) {
    it(`${artikelKey}: fehlerfrei, ${sorten} × 151 Zeilen ohne ID, 157 Preisspalten, Shop-Preis nie unter der Engine`, () => {
      const artikel = mapping.artikel.find((a) => a.key === artikelKey);
      const tpl = lade(VORLAGEN[artikel.format]);
      const { matrix, bericht } = buildImportMatrix({ templateMatrix: tpl, config, mapping, artikelKey });
      expect(bericht.fehler).toEqual([]);
      expect(bericht.warnungen).toEqual([]);
      expect(bericht.unbekannteGruppen).toEqual([]);
      expect(bericht.zeilen).toBe(sorten * 151);
      expect(bericht.zeilenMitId).toBe(0); // fremde Vorlage → Neuanlage ohne Staffel-IDs
      const model = parseLeadprintExport(matrix);
      const preisBlock = findBlock(model, 'articlePrices');
      expect(preisBlock.header).toHaveLength(157);
      expect(preisBlock.header).toEqual(findBlock(parseLeadprintExport(tpl), 'articlePrices').header);
      expect(blockToObjects(findBlock(model, 'article.'))[0].id).toBeNull();
      const preise = blockToObjects(preisBlock);
      expect(preise.every((r) => r.id === null)).toBe(true);
      expect(new Set(preise.map((r) => `${r.paper__id}|${r.wert}`)).size).toBe(preise.length);
      if (artikel.umschlag !== 'mit') return;
      // Kombination mehrerer Optionen (Seiten × Umschlag 4/4 × Cello) ist eine
      // Näherung — nie unter dem Engine-Preis; ohne Hülle höchstens wenige Euro
      // darüber, mit Hülle kommt an den Staffeln der Lift dazu.
      const roh = blockToObjects(findBlock(parseLeadprintExport(buildImportMatrix({ templateMatrix: tpl, config, mapping, artikelKey, huelle: false }).matrix), 'articlePrices'));
      const sorteZuPapier = Object.fromEntries(Object.entries(mapping.sorten).map(([k, v]) => [String(v.sortenId), k]));
      for (const [liste, mitHuelle] of [[roh, false], [preise, true]]) {
        for (const z of liste.filter((r) => [100, 500].includes(r.wert))) {
          const papier = sorteZuPapier[String(z.paper__id)];
          for (const seiten of [4, 24, 48]) {
            const sz = z[`dynopt_aa.5628.${SEITEN[seiten]}`];
            if (sz == null) continue;
            for (const [dU, cello, fz, vz] of [
              ['4c', 'ohne', z['dynopt_aa.5556.16086'], 0],
              ['4c', 'glaenzend', z['dynopt_aa.5556.16086'], z['dynopt_aa.5562.16109']],
            ]) {
              if (vz == null) continue; // Veredelung nicht wählbar (N)
              const shop = cent(z.preis + sz + fz + vz);
              const e = cent(engine({ format: artikel.format, papier, auflage: z.wert, umschlag: artikel.umschlagPapier, seiten, dU, cello }));
              expect(shop, `${papier} × ${z.wert} × ${seiten}S ${dU} ${cello} ${mitHuelle ? 'Hülle' : 'roh'}`).toBeGreaterThanOrEqual(e);
              if (!mitHuelle) expect(shop - e).toBeLessThan(5);
            }
          }
        }
      }
    });
  }
});
