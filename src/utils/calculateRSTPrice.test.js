import { describe, expect, it } from 'vitest';
import {
  calcMakulaturProzent,
  calcMaxSeiten,
  calculateRSTPrice,
  getCoverPaperOptions,
} from './calculateRSTPrice';
import { computeArtikelMitUmschlag } from './leadprintMapper';
import {
  applyPaperPriceRows,
  buildPaperPriceCsv,
  configRev,
  getDefaultPricingConfig,
  migratePricingConfig,
  parseFlexibleNumber,
  parsePaperPriceCsv,
  savePricingConfig,
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
  it('interpoliert die Data_GC-Tabelle (V3) linear (BT6, 150 Ex. → 61,00 €)', () => {
    // V3-Werte BT6: 100 Ex. = 57,50 | 200 Ex. = 64,50 → bei 150: (64,5−57,5)/100×50+57,5
    const calc = calculateRSTPrice(baseForm({ auflage: '150' }), config);
    expect(routeResult(calc, 'gc_horizon').wvKosten).toBeCloseTo(61.0, 10);
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

  // Guidos Kleinmengen-Zielpreise (25/30/30/35 € bei Auflage 1) wurden bis Preisbasis
  // 2.2.0 durch die alte Absolut-Makulatur gepolstert: 5 Netto-Bogen bekamen dort 9
  // Makulaturbogen. Mit dem Prozentmodell (2.3.0) fällt dieses Polster weg, die Preise
  // liegen jetzt 2,5–7 € darunter. Guidos eigener Satz dazu lautet „Kompensation über
  // den Verarbeitungspreis" — d. h. die WV-Tabelle müsste in den Kleinststaffeln
  // angehoben werden. Das ist seine Entscheidung; bis dahin hält dieser Test den
  // Ist-Stand fest, damit die Lücke nicht unbemerkt weiter wandert.
  it('hält den Kleinmengen-Ist-Stand fest (Auflage 1) — Zielpreise offen bei Guido', () => {
    const gcTotal = (form) => routeResult(calculateRSTPrice(form, config), 'gc_horizon').gesamt;
    const cheap = { pInhaltId: 'N_80', dInhaltKey: '1c', dUmschlagKey: '1c', auflage: '1' };

    expect(gcTotal(baseForm({ ...cheap, seiten: '20' }))).toBeCloseTo(21.75, 2); // Ziel 25
    expect(
      gcTotal(baseForm({ ...cheap, seiten: '20', hasUmschlag: true, pUmschlagId: 'N_160' })),
    ).toBeCloseTo(27.48, 2); // Ziel 30
    expect(gcTotal(baseForm({ ...cheap, seiten: '24' }))).toBeCloseTo(27.11, 2); // Ziel 30
    expect(
      gcTotal(baseForm({ ...cheap, seiten: '24', hasUmschlag: true, pUmschlagId: 'N_160' })),
    ).toBeCloseTo(27.83, 2); // Ziel 35 — größte Lücke, WV-Zeile BT 7 kostet bei Auflage 1
    // genauso viel wie BT 6, der Umschlag schlägt daher fast nicht durch.
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
    // Papier zum vollen SRA3-Bogenpreis (kein halber Preis mehr); CC_100 = 43 €/1000 (V3)
    expect(gc.kostenPapierInhalt).toBeCloseTo(gc.bogenInhalt * 0.043 * gc.dbPapierInhalt, 10);
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

  it('V3: R_300 ist bei A5 Hoch kein Umschlag mehr (Breitbahn) → Recycling dort nur ohne Umschlag', () => {
    const a5h = config.formate.find((f) => f.key === 'A5_Hoch');
    expect(a5h.papiereUmschlag).not.toContain('R_300');
    // R_90-Inhalt ohne Umschlag bleibt möglich
    const ohne = calculateRSTPrice(
      baseForm({ formatKey: 'A5_Hoch', pInhaltId: 'R_90', seiten: '16', auflage: '50', hasUmschlag: false }),
      config,
    );
    expect(routeResult(ohne, 'gc_horizon').error).toBeNull();
    // mit R_300-Umschlag lehnt die Engine ab (nicht in der A5H-Umschlagliste)
    const mit = calculateRSTPrice(
      baseForm({ formatKey: 'A5_Hoch', pInhaltId: 'R_90', seiten: '16', auflage: '50', hasUmschlag: true, pUmschlagId: 'R_300' }),
      config,
    );
    for (const result of mit.results) {
      expect(result.error).toContain('nicht zulässig');
    }
  });

  it('V3: Banner-Natur neu — N_80_BAN/N_120_BAN statt N_100_BAN', () => {
    expect(config.papiere.some((p) => p.id === 'N_100_BAN')).toBe(false);
    const banner = config.formate.find((f) => f.key === 'A4_Quer');
    expect(banner.papiereInhalt).toContain('N_80_BAN');
    expect(banner.papiereInhalt).toContain('N_120_BAN');
    const calc = calculateRSTPrice(
      baseForm({ formatKey: 'A4_Quer', pInhaltId: 'N_120_BAN', seiten: '16', auflage: '100', hasUmschlag: false }),
      config,
    );
    expect(routeResult(calc, 'ilda').error).toBeNull();
  });

  it('V3: Papierpreise 07/2026 sind aktiv, kein Platzhalter mehr', () => {
    const preis = (id) => config.papiere.find((p) => p.id === id).preisPro1000;
    expect(preis('CC_120')).toBe(53.1);
    expect(preis('R_90')).toBe(41.2);
    expect(config.papiere.find((p) => p.id === 'R_90').isPlaceholder).toBe(false);
    expect(config.papiere.some((p) => p.isPlaceholder)).toBe(false);
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

  it('Empfehlungslogik ist datengetrieben: eine vierte, günstigere Route kann gewinnen', () => {
    const custom = getDefaultPricingConfig();
    const cheapTable = JSON.parse(JSON.stringify(custom.wvTabellen.ilda_ohneUmschlag));
    for (const row of Object.values(cheapTable)) {
      for (const staffel of Object.keys(row)) row[staffel] = row[staffel] / 2;
    }
    custom.wvTabellen.test_partner = cheapTable;
    custom.routen.push({
      key: 'test',
      name: 'Partner Test',
      typ: 'partner',
      wtStandard: 5,
      wtExpress: 4,
      formate: ['A5_Hoch', 'A5_Quer', 'A4_Hoch'],
      minAuflage: null,
      maxAuflage: null,
      wvTabelleRef: 'test_partner',
      umschlagZuschlag: false,
      maxDickeRef: 'maxDickePartner',
      nutzenRef: 'nutzenPartner',
      preferDeltaRef: null,
    });
    expect(validatePricingConfig(custom).ok).toBe(true);

    // Auflage 501: GC und ILDA scheiden aus (beide max 500); Partner Test ist klar am günstigsten
    const calc = calculateRSTPrice(baseForm({ auflage: '501' }), custom);
    expect(routeResult(calc, 'gc_horizon').error).toContain('maximal 500');
    expect(routeResult(calc, 'ilda').error).toContain('maximal 500');
    const test = routeResult(calc, 'test');
    const kopp = routeResult(calc, 'kopp');
    expect(test.gesamt).toBeLessThan(kopp.gesamt - 30);
    expect(calc.recommendedName).toBe('Partner Test');
  });

  it('ILDA endet bei 500 Exemplaren (Guido, 08.07.2026) — darüber übernimmt Kopp', () => {
    const bei500 = calculateRSTPrice(baseForm({ auflage: '500', seiten: '52', pInhaltId: 'CC_100' }), config);
    expect(routeResult(bei500, 'ilda').error).toBeNull();

    const bei501 = calculateRSTPrice(baseForm({ auflage: '501', seiten: '52', pInhaltId: 'CC_100' }), config);
    expect(routeResult(bei501, 'ilda').error).toContain('maximal 500');
    expect(bei501.recommendedName).toBe('Partner Kopp');
  });
});

describe('Makulatur als Prozentmodell (Guido 05.08.2026, Preisbasis 2.3.0)', () => {
  it('trifft die Stützpunkte von Guidos Kurve', () => {
    expect(calcMakulaturProzent(1)).toBeCloseTo(10, 3);
    expect(calcMakulaturProzent(100)).toBeCloseTo(8, 3);
    expect(calcMakulaturProzent(1000)).toBeCloseTo(5, 3);
    expect(calcMakulaturProzent(10000)).toBeCloseTo(4, 3);
    // fällt monoton weiter; im realistischen Bereich ~3,5 %, Grenzwert 3 %
    expect(calcMakulaturProzent(100000)).toBeCloseTo(3.74, 2);
    expect(calcMakulaturProzent(1e9)).toBeGreaterThan(3);
    expect(calcMakulaturProzent(1e9)).toBeLessThan(calcMakulaturProzent(100000));
  });

  it('reproduziert Guidos Rechenbeispiel exakt: 1.000 Bogen → 105 U / 945 I', () => {
    // 100 Ex., 36 S. Inhalt + Umschlag, A4 (Nutzen 1) → 900 + 100 = 1.000 Bogen
    const gc = routeResult(
      calculateRSTPrice(
        baseForm({ auflage: '100', seiten: '36', hasUmschlag: true, pUmschlagId: 'CC_250' }),
        config,
      ),
      'gc_horizon',
    );
    expect(gc.nettoBogenInhalt + gc.nettoBogenUmschlag).toBe(1000);
    expect(gc.makulaturProzent).toBeCloseTo(5, 3);
    expect(gc.bogenUmschlag).toBe(105);
    expect(gc.bogenInhalt).toBe(945);
  });

  it('bemisst den Prozentsatz am Gesamtauftrag, nicht je Komponente', () => {
    // Beide Komponenten bekommen denselben Faktor
    const gc = routeResult(
      calculateRSTPrice(
        baseForm({ auflage: '250', seiten: '32', hasUmschlag: true, pUmschlagId: 'CC_250' }),
        config,
      ),
      'gc_horizon',
    );
    const faktor = 1 + gc.makulaturProzent / 100;
    expect(gc.bogenInhalt).toBe(Math.round(gc.nettoBogenInhalt * faktor));
    expect(gc.bogenUmschlag).toBe(Math.round(gc.nettoBogenUmschlag * faktor));
    // Prozentsatz gehört zum Gesamtvolumen (2.000 + 250 Bogen), nicht zu 2.000 allein
    expect(gc.makulaturProzent).toBeCloseTo(
      calcMakulaturProzent(gc.nettoBogenInhalt + gc.nettoBogenUmschlag),
      10,
    );
  });

  it('wächst mit der Auflage, der Prozentsatz fällt', () => {
    const maku = (auflage) =>
      routeResult(calculateRSTPrice(baseForm({ auflage }), config), 'gc_horizon');
    const a50 = maku('50');
    const a500 = maku('500');
    expect(a50.makulaturInhalt).toBeLessThan(a500.makulaturInhalt);
    expect(a50.makulaturProzent).toBeGreaterThan(a500.makulaturProzent);
    // Größenordnung: früher waren es bei 3.000 Netto-Bogen 5 Bogen Makulatur
    expect(a500.makulaturInhalt).toBe(130);
  });

  it('bemisst Aufträge unter 10 Broschüren wie 10 (Anlaufmakulatur)', () => {
    const bei = (auflage) =>
      routeResult(calculateRSTPrice(baseForm({ auflage }), config), 'gc_horizon');
    const zehn = bei('10');
    // 1 und 5 Ex. bekommen dieselben Makulaturbogen wie 10 Ex., aber ihre eigene Nettomenge
    expect(bei('1').makulaturInhalt).toBe(zehn.makulaturInhalt);
    expect(bei('5').makulaturInhalt).toBe(zehn.makulaturInhalt);
    expect(bei('1').nettoBogenInhalt).toBe(6);
    expect(bei('1').bogenInhalt).toBe(6 + zehn.makulaturInhalt);
    // ab 10 greift die Regel nicht mehr
    expect(bei('20').makulaturInhalt).toBeGreaterThan(zehn.makulaturInhalt);
  });

  it('druckt nie ohne Anlauf: mindestens ein Makulaturbogen je Komponente', () => {
    // A6 bei GC (Nutzen 4), kleinste Auflage → sehr wenige Netto-Bogen
    const gc = routeResult(
      calculateRSTPrice(
        baseForm({ formatKey: 'A6_Hoch', auflage: '1', seiten: '8', pInhaltId: 'CC_120' }),
        config,
      ),
      'gc_horizon',
    );
    expect(gc.makulaturInhalt).toBeGreaterThanOrEqual(1);
  });

  it('Partnerrouten rechnen mit demselben Modell', () => {
    const calc = calculateRSTPrice(baseForm({ auflage: '300' }), config);
    for (const key of ['gc_horizon', 'kopp', 'ilda']) {
      const r = routeResult(calc, key);
      expect(r.error).toBeNull();
      expect(r.makulaturProzent).toBeCloseTo(calcMakulaturProzent(r.nettoBogenInhalt), 10);
    }
  });
});

describe('P4: GC-Dickenaufschlag (Guido 10.08.2026, A0=80 / X=5)', () => {
  // BD_150 (132 µm): 32 S. = 8 BT × 132 µm = 1,056 mm — knapp über der 1-mm-Grenze
  const dick = { pInhaltId: 'BD_150', seiten: '32' };

  it('unter 1 mm Buchdicke und bis 80 Ex. passiert nichts', () => {
    const duenn = routeResult(
      calculateRSTPrice(baseForm({ auflage: '500', seiten: '16' }), config), // 4×126 µm = 0,504 mm
      'gc_horizon',
    );
    expect(duenn.dickenAufschlag).toBe(0);
    const wenige = routeResult(calculateRSTPrice(baseForm({ ...dick, auflage: '80' }), config), 'gc_horizon');
    expect(wenige.dickenAufschlag).toBe(0);
  });

  it('rechnet (Buchdicke − 1) × (Auflage − 80) × 5 und zählt den Umschlag zur Dicke', () => {
    const ohne = routeResult(calculateRSTPrice(baseForm({ ...dick, auflage: '200' }), config), 'gc_horizon');
    expect(ohne.dickenAufschlag).toBeCloseTo((1.056 - 1) * (200 - 80) * 5, 8);

    // + BD_350-Umschlag (350 µm): 24 S. Inhalt = 0,792 mm, mit Umschlag 1,142 mm
    const mit = routeResult(
      calculateRSTPrice(
        baseForm({ pInhaltId: 'BD_150', seiten: '24', auflage: '200', hasUmschlag: true, pUmschlagId: 'BD_350' }),
        config,
      ),
      'gc_horizon',
    );
    expect(mit.dickenAufschlag).toBeCloseTo((0.792 + 0.35 - 1) * (200 - 80) * 5, 8);
  });

  it('wirkt vor dem Express-Aufschlag und nur bei GC', () => {
    const calc = calculateRSTPrice(baseForm({ ...dick, auflage: '200', produktionszeit: 'express' }), config);
    const gc = routeResult(calc, 'gc_horizon');
    const basis = gc.gesamt - gc.expressSurcharge;
    expect(gc.expressSurcharge).toBeCloseTo(basis * 0.1, 8);
    expect(gc.dickenAufschlag).toBeGreaterThan(0);
    expect(routeResult(calc, 'kopp').dickenAufschlag).toBe(0);
    expect(routeResult(calc, 'ilda').dickenAufschlag).toBe(0);
  });

  it('kippt die Empfehlung ab 200 Ex. bei ≥ 1,25 mm zum Partner (Kalibrierungsziel)', () => {
    // CC_160 (166 µm), 32 S. = 1,328 mm
    const zu = (auflage) =>
      calculateRSTPrice(baseForm({ pInhaltId: 'CC_160', seiten: '32', auflage }), config).recommendedName;
    expect(zu('80')).toBe('GC (Horizon)');
    expect(zu('200')).not.toBe('GC (Horizon)');
  });
});

describe('P1: Umschlag-Ausnahme R_90 → CC_250 / N_250 (A5 Hoch)', () => {
  const r90 = (overrides) =>
    baseForm({ formatKey: 'A5_Hoch', pInhaltId: 'R_90', hasUmschlag: true, ...overrides });

  it('getCoverPaperOptions bietet für R_90 genau die beiden Ausnahmen an', () => {
    const ids = getCoverPaperOptions(config, 'A5_Hoch', 'R_90').map((p) => p.id);
    expect(ids.sort()).toEqual(['CC_250', 'N_250']);
  });

  it('die Engine rechnet R_90 mit CC_250 und N_250, lehnt andere Familien weiter ab', () => {
    for (const pUmschlagId of ['CC_250', 'N_250']) {
      const gc = routeResult(calculateRSTPrice(r90({ pUmschlagId }), config), 'gc_horizon');
      expect(gc.error).toBeNull();
    }
    const bd = routeResult(calculateRSTPrice(r90({ pUmschlagId: 'BD_250' }), config), 'gc_horizon');
    expect(bd.error).toContain('Papierfamilie');
  });

  it('die Ausnahme wirkt nirgendwo sonst (A4-Recycling behält nur R_300)', () => {
    // R_90 existiert nur bei A5 Hoch als Inhalt; A4-Recycling (R_80/R_100) bleibt rein R
    for (const pInhaltId of ['R_80', 'R_100']) {
      const ids = getCoverPaperOptions(config, 'A4_Hoch', pInhaltId).map((p) => p.id);
      expect(ids).toEqual(['R_300']);
    }
  });

  it('CC_250-Umschlag auf R_90 erlaubt Cellophanierung (hängt an der Umschlag-Familie)', () => {
    const gc = routeResult(
      calculateRSTPrice(r90({ pUmschlagId: 'CC_250', celloUmschlag: 'matt' }), config),
      'gc_horizon',
    );
    expect(gc.error).toBeNull();
    expect(gc.celloKosten).toBeGreaterThan(0);
  });

  it('der Mapper übernimmt die Ausnahme aus getCoverPaperOptions', () => {
    const zeilen = computeArtikelMitUmschlag({
      config, formatKey: 'A5_Hoch', farbigkeit: '4c', auflagen: [100],
    });
    const r90Zeilen = zeilen.filter((z) => z.pInhaltId === 'R_90');
    expect(r90Zeilen.map((z) => z.pUmschlagId).sort()).toEqual(['CC_250', 'N_250']);
  });
});

describe('P3/B5: 4 Seiten Inhalt mit Umschlag, klare Seitenzahl-Meldungen', () => {
  it('4 Seiten + Umschlag rechnet regulär über WV-Zeile 2', () => {
    const calc = calculateRSTPrice(
      baseForm({ seiten: '4', hasUmschlag: true, pUmschlagId: 'CC_250', auflage: '100' }),
      config,
    );
    const gc = routeResult(calc, 'gc_horizon');
    expect(gc.error).toBeNull();
    expect(gc.nettoBogenInhalt).toBe(100); // 1 Bogenteil × 100 Ex., Nutzen 1
    expect(gc.wvKosten).toBe(config.wvTabellen.gc_horizon[2][100]);
    expect(routeResult(calc, 'kopp').error).toBeNull();
  });

  it('4 Seiten ohne Umschlag wird mit klarer Meldung abgelehnt', () => {
    const gc = routeResult(calculateRSTPrice(baseForm({ seiten: '4' }), config), 'gc_horizon');
    expect(gc.error).toContain('nur mit Umschlag');
  });

  it('kein Vielfaches von 4 nennt die Seitenzahl als Ursache, nicht die Preistabelle (B5)', () => {
    const calc = calculateRSTPrice(baseForm({ seiten: '10' }), config);
    for (const r of calc.results) {
      expect(r.error).toContain('Vielfaches von 4');
      expect(r.error).not.toContain('Preistabelle');
    }
  });
});

describe('Routengrenzen', () => {
  it('Kopp ist auf 1000 Exemplare begrenzt (Guidos Produktionsmatrix, Bug-Hunt B1)', () => {
    const bei = (auflage) => routeResult(calculateRSTPrice(baseForm({ auflage }), config), 'kopp');
    expect(bei('1000').error).toBeNull();
    expect(bei('1001').error).toContain('maximal 1000');
    // vorher lieferte die Engine hier den flachen Preis der 1000er-Staffel weiter
    expect(bei('20000').error).toContain('maximal 1000');
  });

  it('über 1000 Exemplaren bleibt keine Route übrig', () => {
    const calc = calculateRSTPrice(baseForm({ auflage: '2000' }), config);
    expect(calc.validResults).toHaveLength(0);
    expect(calc.recommendedName).toBeNull();
  });
});

describe('pricingConfig: Schema-Migration beim Laden', () => {
  it('füllt Settings, die ältere Stände noch nicht kennen, aus dem Default auf', () => {
    // Nachgestellt: geteilter 2.2.0-Stand ohne die 2.4.0-Dickenaufschlag-Settings.
    // Ohne Migration wäre er „ungültig" und blockierte das Zurücksetzen (B10-Folge).
    const alt = getDefaultPricingConfig();
    delete alt.settings.gcDickenAufschlagAbMm;
    delete alt.settings.gcDickenAufschlagAbAuflage;
    delete alt.settings.gcDickenAufschlagFaktor;
    expect(validatePricingConfig(alt).ok).toBe(false);

    const migriert = migratePricingConfig(alt);
    expect(validatePricingConfig(migriert).ok).toBe(true);
    expect(migriert.settings.gcDickenAufschlagAbAuflage).toBe(80);
    expect(migriert.settings.gcDickenAufschlagFaktor).toBe(5);
    // vorhandene Werte bleiben unangetastet, das Original wird nicht mutiert
    expect(migriert.settings.setupKosten).toBe(alt.settings.setupKosten);
    expect(alt.settings.gcDickenAufschlagFaktor).toBeUndefined();
  });

  it('lässt vollständige Stände unverändert (gleiche Referenz)', () => {
    const voll = getDefaultPricingConfig();
    expect(migratePricingConfig(voll)).toBe(voll);
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

  it('configRev liefert 0 ohne meta.rev, sonst den Wert (Basis der Konfliktprüfung)', () => {
    expect(configRev(getDefaultPricingConfig())).toBe(0);
    expect(configRev({ meta: { rev: 7 } })).toBe(7);
    expect(configRev(null)).toBe(0);
    expect(configRev({ meta: {} })).toBe(0);
  });

  it('parseFlexibleNumber liest deutsche UND englische Schreibweisen korrekt', () => {
    expect(parseFlexibleNumber('35,5')).toBe(35.5);
    expect(parseFlexibleNumber('35.5')).toBe(35.5); // vorher: 355 (10×-Bug)
    expect(parseFlexibleNumber('1.234,5')).toBe(1234.5);
    expect(parseFlexibleNumber('1,234.5')).toBe(1234.5);
    expect(parseFlexibleNumber('1.234.567')).toBe(1234567);
    expect(parseFlexibleNumber(42)).toBe(42);
    expect(parseFlexibleNumber('abc')).toBeNaN();
    expect(parseFlexibleNumber('')).toBeNaN();
  });

  it('CSV-Export quotet Sonderzeichen: Namen mit ";" und "." überleben den Roundtrip', () => {
    const custom = getDefaultPricingConfig();
    custom.papiere[0].name = 'Munken 2.0; matt';
    const csv = buildPaperPriceCsv(custom);
    const { rows, errors } = parsePaperPriceCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(custom.papiere.length);
    expect(rows[0].id).toBe(custom.papiere[0].id);
    expect(rows[0].preis_pro_1000).toBe(custom.papiere[0].preisPro1000);
  });

  it('lehnt leere formate/papiere/routen und negative Settings ab', () => {
    const empty = getDefaultPricingConfig();
    empty.formate = [];
    empty.routen = [];
    const emptyResult = validatePricingConfig(empty);
    expect(emptyResult.ok).toBe(false);
    expect(emptyResult.errors.join('\n')).toContain('mindestens ein Format');

    const negative = getDefaultPricingConfig();
    negative.settings.setupKosten = -5;
    const negativeResult = validatePricingConfig(negative);
    expect(negativeResult.ok).toBe(false);
    expect(negativeResult.errors.join('\n')).toContain('setupKosten');
  });

  it('maxDickeRef darf auf per Config ergänzte Settings verweisen', () => {
    const custom = getDefaultPricingConfig();
    custom.settings.maxDickeNeuerPartner = 2000;
    custom.routen[1].maxDickeRef = 'maxDickeNeuerPartner';
    expect(validatePricingConfig(custom).ok).toBe(true);

    custom.routen[1].maxDickeRef = 'gibtEsNicht';
    expect(validatePricingConfig(custom).ok).toBe(false);
  });

  it('savePricingConfig persistiert keine ungültige Config', () => {
    const broken = getDefaultPricingConfig();
    broken.papiere[0].preisPro1000 = 0;
    expect(savePricingConfig(broken)).toBe(false);
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
