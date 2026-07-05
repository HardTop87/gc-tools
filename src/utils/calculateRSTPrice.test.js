import { describe, expect, it } from 'vitest';
import {
  calcMaxSeiten,
  calculateRSTPrice,
} from './calculateRSTPrice';
import {
  applyPaperPriceRows,
  buildPaperPriceCsv,
  getDefaultPricingConfig,
  parsePaperPriceCsv,
  validatePricingConfig,
} from './pricingConfig';

const config = getDefaultPricingConfig();

function baseForm(overrides = {}) {
  return {
    formatKey: 'A4_Hoch',
    auflage: '100',
    seiten: '24',
    pInhaltId: 'CC_120',
    dInhaltKey: '4c',
    hasUmschlag: false,
    pUmschlagId: '',
    dUmschlagKey: '4c',
    celloUmschlag: 'ohne',
    produktionszeit: 'standard',
    ...overrides,
  };
}

function routeResult(calc, key) {
  return calc.results.find((r) => r.key === key);
}

describe('Seitenlimits aus Blattdicken (Spec 4.1)', () => {
  it('reproduziert die Werte der Übersichts-Dateien', () => {
    expect(calcMaxSeiten({ maxDicke: 2500, dickeInhalt: 106 })).toBe(92); // CC 100 ohne U, Partner
    expect(calcMaxSeiten({ maxDicke: 1500, dickeInhalt: 106 })).toBe(56); // CC 100 ohne U, GC
    expect(calcMaxSeiten({ maxDicke: 2500, dickeInhalt: 106, dickeUmschlag: 166 })).toBe(88); // CC 100 + CC 160
    // BD-170-Fälle: korrigierte Werte (Excel-Formelfehler N4 statt N3)
    expect(calcMaxSeiten({ maxDicke: 2500, dickeInhalt: 159, dickeUmschlag: 159 })).toBe(56);
    expect(calcMaxSeiten({ maxDicke: 1500, dickeInhalt: 159, dickeUmschlag: 159 })).toBe(32);
    expect(calcMaxSeiten({ maxDicke: 2500, dickeInhalt: 159, dickeUmschlag: 350 })).toBe(52); // BD 170 + BD 350
  });

  it('greift jetzt auch bei Partnern in Standardformaten', () => {
    // CC_120 (126 µm) + CC_300 (305 µm): floor((2500−305)/126)×4 = 68 → 72 Seiten unzulässig
    const calc = calculateRSTPrice(
      baseForm({ seiten: '72', auflage: '200', hasUmschlag: true, pUmschlagId: 'CC_300' }),
      config,
    );
    expect(routeResult(calc, 'kopp').error).toContain('max. 68 Seiten');
    expect(routeResult(calc, 'ilda').error).toContain('max. 68 Seiten');
    // GC strenger (1500 µm): floor((1500−305)/126)×4 = 36
    expect(routeResult(calc, 'gc_horizon').error).toContain('max. 36 Seiten');
  });
});

describe('GC (Horizon)', () => {
  it('interpoliert die neue Data_GC-Tabelle linear (BT6, 150 Ex. → 52,70 €)', () => {
    const calc = calculateRSTPrice(baseForm({ auflage: '150' }), config);
    expect(routeResult(calc, 'gc_horizon').wvKosten).toBeCloseTo(52.7, 10);
  });

  it('erlaubt Auflagen bis 500 und lehnt darüber ab', () => {
    const ok = calculateRSTPrice(baseForm({ auflage: '500' }), config);
    expect(routeResult(ok, 'gc_horizon').error).toBeNull();

    const tooMany = calculateRSTPrice(baseForm({ auflage: '501' }), config);
    expect(routeResult(tooMany, 'gc_horizon').error).toContain('maximal 500');
  });

  it('berechnet den Umschlag-Zuschlag: 10 → 0 €, 11 → 5,55 €, 100 → 10 €', () => {
    const withCover = (auflage) =>
      routeResult(
        calculateRSTPrice(
          baseForm({ auflage, hasUmschlag: true, pUmschlagId: 'CC_300', pInhaltId: 'CC_120' }),
          config,
        ),
        'gc_horizon',
      );

    expect(withCover('10').umschlagZuschlag).toBe(0);
    expect(withCover('11').umschlagZuschlag).toBeCloseTo(5.55, 10);
    expect(withCover('100').umschlagZuschlag).toBeCloseTo(10, 10);
  });

  it('Kopp/ILDA haben keinen Umschlag-Zuschlag', () => {
    const calc = calculateRSTPrice(
      baseForm({ auflage: '200', hasUmschlag: true, pUmschlagId: 'CC_300' }),
      config,
    );
    expect(routeResult(calc, 'kopp').umschlagZuschlag).toBe(0);
    expect(routeResult(calc, 'ilda').umschlagZuschlag).toBe(0);
  });

  it('mit Umschlag sind max. 44 Inhaltsseiten möglich (BT 12 = letzte Tabellenzeile)', () => {
    const ok = calculateRSTPrice(
      baseForm({ seiten: '44', hasUmschlag: true, pUmschlagId: 'CC_160', pInhaltId: 'CC_100' }),
      config,
    );
    expect(routeResult(ok, 'gc_horizon').error).toBeNull();

    const tooThick = calculateRSTPrice(
      baseForm({ seiten: '48', hasUmschlag: true, pUmschlagId: 'CC_160', pInhaltId: 'CC_100' }),
      config,
    );
    expect(routeResult(tooThick, 'gc_horizon').error).toContain('nicht in Preistabelle');
  });

  it('trifft die Kleinmengen-Zielpreise (Auflage 1, 1c, günstiges Papier, ±3 €)', () => {
    const gcTotal = (form) => routeResult(calculateRSTPrice(form, config), 'gc_horizon').gesamt;
    const expectNear = (value, target) => expect(Math.abs(value - target)).toBeLessThanOrEqual(3);

    const cheap = { pInhaltId: 'N_80', dInhaltKey: '1c', dUmschlagKey: '1c', auflage: '1' };
    expectNear(gcTotal(baseForm({ ...cheap, seiten: '20' })), 25);
    expectNear(
      gcTotal(baseForm({ ...cheap, seiten: '20', hasUmschlag: true, pUmschlagId: 'N_160' })),
      30,
    );
    expectNear(gcTotal(baseForm({ ...cheap, seiten: '24' })), 30);
    expectNear(
      gcTotal(baseForm({ ...cheap, seiten: '24', hasUmschlag: true, pUmschlagId: 'N_160' })),
      35,
    );
  });
});

describe('Format A6_Hoch', () => {
  it('rechnet bei GC mit Nutzen 4 (100 Ex. × 24 S. → 150 Netto-Bogen)', () => {
    const calc = calculateRSTPrice(baseForm({ formatKey: 'A6_Hoch' }), config);
    const gc = routeResult(calc, 'gc_horizon');
    expect(gc.error).toBeNull();
    expect(gc.nutzen).toBe(4);
    expect(gc.nettoBogenInhalt).toBe(150);
  });

  it('wird von Kopp unterstützt, von ILDA nicht', () => {
    const calc = calculateRSTPrice(baseForm({ formatKey: 'A6_Hoch' }), config);
    expect(routeResult(calc, 'kopp').error).toBeNull();
    expect(routeResult(calc, 'ilda').error).toContain('nicht unterstützt');
  });
});

describe('A5_Hoch bei GC: kein SRA4-Sonderfall mehr', () => {
  it('nutzt Nutzen 2 und den vollen Klick-Grundpreis (kein Faktor 0,7)', () => {
    const calc = calculateRSTPrice(
      baseForm({ formatKey: 'A5_Hoch', pInhaltId: 'CC_100' }),
      config,
    );
    const gc = routeResult(calc, 'gc_horizon');
    expect(gc.error).toBeNull();
    expect(gc.nutzen).toBe(2);
    expect(gc.formatName).toBe('SRA3');
    // effektiver Klickpreis pro Klick = (0,04 + 0 Gewichtszuschlag) × dbDruck — ohne 0,7
    const effektiverKlick = gc.kostenKlickInhalt / (gc.bogenInhalt * 2);
    expect(effektiverKlick).toBeCloseTo(0.04 * gc.dbDruckInhalt, 10);
    // Papier zum vollen SRA3-Bogenpreis (kein halber Preis mehr)
    expect(gc.kostenPapierInhalt).toBeCloseTo(gc.bogenInhalt * 0.035 * gc.dbPapierInhalt, 10);
  });
});

describe('Cellophanierung', () => {
  it('Banner-Formate: Stückpreis × 1,5 (matt → 0,30 €/Bogen)', () => {
    const calc = calculateRSTPrice(
      baseForm({
        formatKey: '30x30',
        pInhaltId: 'CC_120_BAN',
        hasUmschlag: true,
        pUmschlagId: 'CC_250_BAN',
        celloUmschlag: 'matt',
      }),
      config,
    );
    const ilda = routeResult(calc, 'ilda');
    expect(ilda.error).toBeNull();
    expect(ilda.celloStueckpreis).toBeCloseTo(0.3, 10);
    expect(ilda.celloGrundkosten).toBe(20);
  });

  it('Standardformate: unveränderte Stückpreise (matt → 0,20 €/Bogen)', () => {
    const calc = calculateRSTPrice(
      baseForm({ hasUmschlag: true, pUmschlagId: 'CC_300', celloUmschlag: 'matt' }),
      config,
    );
    expect(routeResult(calc, 'gc_horizon').celloStueckpreis).toBeCloseTo(0.2, 10);
  });
});

describe('Papierregeln', () => {
  it('N_160 ist als Inhaltspapier nicht mehr zulässig', () => {
    const calc = calculateRSTPrice(baseForm({ pInhaltId: 'N_160' }), config);
    for (const result of calc.results) {
      expect(result.error).toContain('nicht zulässig');
    }
  });

  it('Familienregel: Natur-Inhalt mit Recycling-Umschlag ist unzulässig', () => {
    const calc = calculateRSTPrice(
      baseForm({ pInhaltId: 'N_80', hasUmschlag: true, pUmschlagId: 'R_300' }),
      config,
    );
    for (const result of calc.results) {
      expect(result.error).toContain('Papierfamilie');
    }
  });

  it('Recycling-Inhalt mit R_300-Umschlag ist zulässig (Familie R)', () => {
    const calc = calculateRSTPrice(
      baseForm({ pInhaltId: 'R_80', hasUmschlag: true, pUmschlagId: 'R_300', seiten: '16' }),
      config,
    );
    expect(routeResult(calc, 'kopp').error).toBeNull();
  });
});

describe('Express & Empfehlung', () => {
  it('Express schlägt 10 % auf und verkürzt die Produktionszeit', () => {
    const standard = routeResult(calculateRSTPrice(baseForm(), config), 'gc_horizon');
    const express = routeResult(
      calculateRSTPrice(baseForm({ produktionszeit: 'express' }), config),
      'gc_horizon',
    );
    expect(express.gesamt).toBeCloseTo(standard.gesamt * 1.1, 10);
    expect(express.produktionszeitWT).toBe(2);
  });

  it('empfiehlt GC (Horizon) im Kleinauflagenbereich', () => {
    const calc = calculateRSTPrice(baseForm({ auflage: '50' }), config);
    expect(calc.recommendedName).toBe('GC (Horizon)');
  });
});

describe('pricingConfig: Validierung & Papierpreis-Import', () => {
  it('Default-Config ist valide', () => {
    expect(validatePricingConfig(config)).toEqual({ ok: true, errors: [] });
  });

  it('erkennt Preis ≤ 0, Staffel-Lücken und unbekannte Referenzen', () => {
    const broken = getDefaultPricingConfig();
    broken.papiere[0].preisPro1000 = 0;
    delete broken.wvTabellen.gc_horizon['7'];
    broken.formate[0].papiereInhalt.push('GIBT_ES_NICHT');
    const { ok, errors } = validatePricingConfig(broken);
    expect(ok).toBe(false);
    expect(errors.join('\n')).toContain('preisPro1000');
    expect(errors.join('\n')).toContain('nicht lückenlos');
    expect(errors.join('\n')).toContain('GIBT_ES_NICHT');
  });

  it('CSV-Roundtrip: Export → Parse → Apply ändert nur bekannte IDs', () => {
    const csv = buildPaperPriceCsv(config);
    const { rows, errors } = parsePaperPriceCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(config.papiere.length);

    rows[0].preis_pro_1000 = rows[0].preis_pro_1000 + 1;
    rows.push({ id: 'UNBEKANNT_99', preis_pro_1000: 50 });
    const { config: next, summary } = applyPaperPriceRows(config, rows);

    expect(summary.geaendert).toEqual([rows[0].id]);
    expect(summary.unbekannt).toEqual(['UNBEKANNT_99']);
    expect(summary.unveraendert).toHaveLength(config.papiere.length - 1);
    expect(next.papiere[0].preisPro1000).toBe(config.papiere[0].preisPro1000 + 1);
    // Original bleibt unangetastet
    expect(config.papiere[0].preisPro1000).not.toBe(next.papiere[0].preisPro1000);
  });
});
