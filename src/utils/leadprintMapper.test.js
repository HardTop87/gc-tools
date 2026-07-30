import { describe, expect, it } from 'vitest';
import {
  SEITEN_STUETZSTELLEN,
  computeInhaltZeile,
  computeUmschlagZeile,
  computeArtikelOhneUmschlag,
  computeArtikelMitUmschlag,
} from './leadprintMapper';
import { calculateRSTPrice } from './calculateRSTPrice';
import { getDefaultPricingConfig } from './pricingConfig';

const config = getDefaultPricingConfig();
const AUFLAGEN = [1, 2, 5, 10, 100, 500, 501, 1000];

function direktpreis(overrides) {
  const calc = calculateRSTPrice({
    formatKey: 'A4_Hoch', dInhaltKey: '4c', hasUmschlag: false, pUmschlagId: '',
    dUmschlagKey: '1c', celloUmschlag: 'ohne', produktionszeit: 'standard', ...overrides,
  }, config);
  const route = calc.validResults.find((r) => r.name === calc.recommendedName);
  return route ? route.gesamt : null;
}

describe('Leadprint-Mapper: Preiszeilen', () => {
  it('Basispreis + Seiten-Aufschlag ergibt exakt den Direktpreis der Engine', () => {
    const zeile = computeInhaltZeile({
      config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'CC_120', auflage: 100,
    });
    expect(zeile.basisSeiten).toBe(8);
    for (const seiten of [8, 24, 44]) {
      const shopPreis = zeile.basisPreis + (seiten === 8 ? 0 : zeile.aufschlaege[seiten]);
      expect(shopPreis).toBeCloseTo(direktpreis({ seiten, pInhaltId: 'CC_120', auflage: 100 }), 8);
    }
  });

  it('unmögliche Seitenzahlen liefern null (Leer-Zelle im Shop) statt eines Preises', () => {
    // CC_160 (166 µm): Partner-Limit floor(2500/166)×4 = 60 Seiten
    const zeile = computeInhaltZeile({
      config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'CC_160', auflage: 100,
    });
    expect(zeile.aufschlaege[60]).not.toBeNull();
    expect(zeile.aufschlaege[64]).toBeNull();
  });

  it('Lücken liegen immer am Zeilenende — nie ein Loch mitten in der Seitenreihe', () => {
    const zeilen = computeArtikelOhneUmschlag({
      config, formatKey: 'A4_Hoch', farbigkeit: '4c', auflagen: AUFLAGEN,
    });
    expect(zeilen.length).toBeGreaterThan(0);
    for (const zeile of zeilen) {
      const werte = SEITEN_STUETZSTELLEN.slice(1).map((s) => zeile.aufschlaege[s]);
      const ersteLuecke = werte.indexOf(null);
      if (ersteLuecke !== -1) {
        expect(werte.slice(ersteLuecke).every((v) => v === null)).toBe(true);
      }
    }
  });

  it('Seiten-Aufschläge sind nie negativ (mehr Seiten kostet nie weniger)', () => {
    for (const farbigkeit of ['1c', '4c']) {
      const zeilen = computeArtikelOhneUmschlag({ config, formatKey: 'A4_Hoch', farbigkeit, auflagen: AUFLAGEN });
      for (const zeile of zeilen) {
        for (const [seiten, aufschlag] of Object.entries(zeile.aufschlaege)) {
          if (aufschlag !== null) {
            expect(aufschlag, `${zeile.pInhaltId}/${zeile.auflage}Ex/${seiten}S`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe('Leadprint-Mapper: Umschlag-Artikel', () => {
  it('Aufschläge sind additiv separabel — Seiten + Umschlag-Farbigkeit + Veredelung', () => {
    // Zentrale Annahme des flachen Leadprint-Preismodells: Der Shop addiert die
    // Options-Aufschläge; das muss dem echten Kombinationspreis entsprechen.
    const zeile = computeUmschlagZeile({
      config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'CC_120', pUmschlagId: 'CC_300', auflage: 300,
    });
    const echt = calculateRSTPrice({
      formatKey: 'A4_Hoch', auflage: 300, seiten: 32, pInhaltId: 'CC_120', dInhaltKey: '4c',
      hasUmschlag: true, pUmschlagId: 'CC_300', dUmschlagKey: '4c', celloUmschlag: 'matt',
      produktionszeit: 'standard',
    }, config);
    const echtPreis = echt.validResults.find((r) => r.name === echt.recommendedName).gesamt;

    const addiert = zeile.basisPreis
      + zeile.aufschlaegeSeiten[32]
      + zeile.aufschlagFarbigkeitUmschlag
      + zeile.aufschlaegeVeredelung.matt;
    expect(addiert).toBeCloseTo(echtPreis, 8);
  });

  it('Veredelung nur bei CC/BD-Umschlägen, bei Natur/Recycling leer', () => {
    const cc = computeUmschlagZeile({
      config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'CC_120', pUmschlagId: 'CC_300', auflage: 100,
    });
    expect(cc.veredelungMoeglich).toBe(true);
    expect(cc.aufschlaegeVeredelung.matt).toBeGreaterThan(0);

    const natur = computeUmschlagZeile({
      config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'N_80', pUmschlagId: 'N_250', auflage: 100,
    });
    expect(natur.veredelungMoeglich).toBe(false);
    expect(natur.aufschlaegeVeredelung).toEqual({});
  });

  it('erzeugt nur familiengleiche Inhalt/Umschlag-Kombinationen (Familienregel)', () => {
    const zeilen = computeArtikelMitUmschlag({
      config, formatKey: 'A4_Hoch', farbigkeit: '4c', auflagen: [100],
    });
    const familie = (id) => config.papiere.find((p) => p.id === id).familie;
    for (const zeile of zeilen) {
      expect(familie(zeile.pUmschlagId)).toBe(familie(zeile.pInhaltId));
    }
  });

  it('V3: R_90 bei A5 Hoch erzeugt keine mit-Umschlag-Zeile (R_300 ist Breitbahn)', () => {
    const zeilen = computeArtikelMitUmschlag({
      config, formatKey: 'A5_Hoch', farbigkeit: '4c', auflagen: [100],
    });
    expect(zeilen.some((z) => z.pInhaltId === 'R_90')).toBe(false);
    // ohne Umschlag bleibt R_90 bestellbar
    const ohne = computeArtikelOhneUmschlag({
      config, formatKey: 'A5_Hoch', farbigkeit: '4c', auflagen: [100],
    });
    expect(ohne.some((z) => z.pInhaltId === 'R_90')).toBe(true);
  });

  it('Umschlag-Farbigkeit und Veredelung wachsen monoton mit der Auflage', () => {
    const auflagen = [1, 10, 100, 500, 1000];
    const zeilen = auflagen.map((auflage) => computeUmschlagZeile({
      config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'CC_120', pUmschlagId: 'CC_300', auflage,
    }));
    for (let i = 1; i < zeilen.length; i += 1) {
      expect(zeilen[i].aufschlagFarbigkeitUmschlag).toBeGreaterThan(zeilen[i - 1].aufschlagFarbigkeitUmschlag);
      expect(zeilen[i].aufschlaegeVeredelung.matt).toBeGreaterThan(zeilen[i - 1].aufschlaegeVeredelung.matt);
    }
  });
});

describe('Leadprint-Mapper: Struktur', () => {
  it('deckt die 29 Seiten-Listenwerte des Optionsfelds ab (8–120 in 4er-Schritten)', () => {
    expect(SEITEN_STUETZSTELLEN).toHaveLength(29);
    expect(SEITEN_STUETZSTELLEN[0]).toBe(8);
    expect(SEITEN_STUETZSTELLEN.at(-1)).toBe(120);
  });

  it('liefert für unbekannte Formate eine leere Matrix statt zu werfen', () => {
    expect(computeArtikelOhneUmschlag({ config, formatKey: 'GIBT_ES_NICHT', farbigkeit: '4c', auflagen: [100] })).toEqual([]);
    expect(computeArtikelMitUmschlag({ config, formatKey: 'GIBT_ES_NICHT', farbigkeit: '4c', auflagen: [100] })).toEqual([]);
  });
});
