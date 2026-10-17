import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultPricingConfig,
  getPendingPublish,
  migratePricingConfig,
  setPendingPublish,
  validatePricingConfig,
} from './pricingConfig';

// Sweeps rechnen tausende Zellen; unter Systemlast (Load > 100 beobachtet)
// dauern sie statt ~0,5 s auch 10 s — das Standard-Limit von 5 s wäre dann
// ein Fehlalarm. Ergebnis zählt, nicht die Zeit.
vi.setConfig({ testTimeout: 120_000 });

// Bug-Hunt V5, Paket „Validierung härten" (M1, M2, M3, N1, N2, N3, N5, N8, M5):
// validatePricingConfig ist die einzige Schranke zwischen JSON-Import/Blob und
// der Engine. Alles, was hier durchkommt, läuft bei allen Nutzern im Rechner.

function mutiert(fn) {
  const c = getDefaultPricingConfig();
  fn(c);
  return validatePricingConfig(c);
}

function fehlerText(result) {
  return result.errors.join('\n');
}

describe('Validierung: Rückwärtskompatibilität', () => {
  it('Default-Config ist weiterhin gültig', () => {
    expect(validatePricingConfig(getDefaultPricingConfig())).toEqual({ ok: true, errors: [] });
  });

  it('ILDA darf minAuflage null (keine Untergrenze) und preferDeltaRef null behalten', () => {
    const c = getDefaultPricingConfig();
    const ilda = c.routen.find((r) => r.key === 'ilda');
    expect(ilda.minAuflage).toBeNull();
    expect(ilda.preferDeltaRef).toBeNull();
    expect(validatePricingConfig(c).ok).toBe(true);
    // auch ganz fehlend (ältere Stände) bleibt erlaubt
    delete ilda.minAuflage;
    delete ilda.preferDeltaRef;
    expect(validatePricingConfig(c).ok).toBe(true);
  });

  it('umschlagAusnahmen darf fehlen oder null sein (Stände vor 2.4.0)', () => {
    expect(mutiert((c) => delete c.umschlagAusnahmen).ok).toBe(true);
    expect(mutiert((c) => { c.umschlagAusnahmen = null; }).ok).toBe(true);
  });

  it('gewichtszuschlaege darf leer sein (kein Zuschlag), muss aber eine Liste sein', () => {
    expect(mutiert((c) => { c.gewichtszuschlaege = []; }).ok).toBe(true);
    expect(fehlerText(mutiert((c) => delete c.gewichtszuschlaege))).toContain('gewichtszuschlaege');
  });

  it('ein Stand vor 2.6.0 ist nach Migration gültig', () => {
    const alt = getDefaultPricingConfig();
    for (const key of Object.keys(alt.settings)) {
      if (key.startsWith('kleinmengen')) delete alt.settings[key];
    }
    expect(validatePricingConfig(alt).ok).toBe(false);
    expect(validatePricingConfig(migratePricingConfig(alt)).ok).toBe(true);
  });
});

describe('M1: fehlende oder falsch getypte Listen werden abgelehnt (vorher Engine-TypeError)', () => {
  it.each([
    ['gewichtszuschlaege fehlt', (c) => delete c.gewichtszuschlaege, 'gewichtszuschlaege'],
    ['gewichtszuschlaege ist ein Objekt', (c) => { c.gewichtszuschlaege = {}; }, 'gewichtszuschlaege'],
    ['cello.erlaubteFamilien fehlt', (c) => delete c.cello.erlaubteFamilien, 'erlaubteFamilien'],
    ['cello.erlaubteFamilien unbekannte Familie', (c) => { c.cello.erlaubteFamilien = ['CC', 'XY']; }, 'unbekannte Familie "XY"'],
    ['cello.arten fehlt', (c) => delete c.cello.arten, 'cello.arten'],
    ['cello fehlt', (c) => delete c.cello, 'cello'],
    ['formate[].papiereInhalt fehlt', (c) => delete c.formate[0].papiereInhalt, 'papiereInhalt'],
    ['formate[].papiereInhalt leer', (c) => { c.formate[0].papiereInhalt = []; }, 'mindestens ein Inhaltspapier'],
    ['formate[].papiereUmschlag fehlt', (c) => delete c.formate[0].papiereUmschlag, 'papiereUmschlag'],
    ['formate[].papiereUmschlag ist ein String', (c) => { c.formate[0].papiereUmschlag = 'CC_300'; }, 'papiereUmschlag'],
    ['formate[].name fehlt', (c) => delete c.formate[0].name, 'name fehlt'],
    ['formate[].name keine Zeichenkette', (c) => { c.formate[0].name = 42; }, 'name fehlt'],
    ['formate[].key doppelt', (c) => { c.formate[1].key = c.formate[0].key; }, 'key doppelt'],
    ['routen[].formate fehlt', (c) => delete c.routen[0].formate, 'formate'],
    ['routen[].formate leer', (c) => { c.routen[0].formate = []; }, 'nicht leere Liste'],
    ['cello.arten[].key keine Zeichenkette', (c) => { c.cello.arten[1].key = 5; }, 'key fehlt'],
    ['cello.arten[].name leer', (c) => { c.cello.arten[1].name = ''; }, 'name fehlt'],
    ['cello.arten[].key doppelt', (c) => { c.cello.arten[2].key = c.cello.arten[1].key; }, 'key doppelt'],
    ['papiere ist ein Objekt', (c) => { c.papiere = {}; }, 'papiere: muss eine Liste'],
    ['formate ist ein String', (c) => { c.formate = 'A4'; }, 'formate: muss eine Liste'],
    ['routen[] enthält null', (c) => { c.routen[0] = null; }, 'kein Objekt'],
  ])('%s', (_name, mutation, erwartet) => {
    const result = mutiert(mutation);
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain(erwartet);
  });

  it('papiereUmschlag darf leer sein (Format ohne Umschlagangebot)', () => {
    expect(mutiert((c) => { c.formate[0].papiereUmschlag = []; }).ok).toBe(true);
  });
});

describe('M2: Zahlen nur als echte Zahlen (keine Strings, keine negativen Preise)', () => {
  it.each([
    ['papiere[].gsm als String', (c) => { c.papiere[0].gsm = '80'; }, 'gsm muss eine Zahl > 0'],
    ['papiere[].dickeUm 0', (c) => { c.papiere[0].dickeUm = 0; }, 'dickeUm muss eine Zahl > 0'],
    ['papiere[].preisPro1000 als String', (c) => { c.papiere[0].preisPro1000 = '67'; }, 'preisPro1000'],
    ['gewichtszuschlaege[].zuschlag als String', (c) => { c.gewichtszuschlaege[1].zuschlag = '0.003'; }, 'zuschlag muss eine Zahl ≥ 0'],
    ['gewichtszuschlaege[].zuschlag negativ', (c) => { c.gewichtszuschlaege[1].zuschlag = -0.1; }, 'zuschlag muss eine Zahl ≥ 0'],
    ['gewichtszuschlaege[].abGsm als String', (c) => { c.gewichtszuschlaege[1].abGsm = '120'; }, 'abGsm muss eine Zahl ≥ 0'],
    ['gewichtszuschlaege nicht aufsteigend', (c) => { c.gewichtszuschlaege[2].abGsm = 100; }, 'nicht aufsteigend'],
    ['WV-Preis als String', (c) => { c.wvTabellen.gc_horizon[2][100] = '67'; }, 'Preis muss eine Zahl > 0'],
    ['WV-Preis 0', (c) => { c.wvTabellen.gc_horizon[2][100] = 0; }, 'Preis muss eine Zahl > 0'],
    ['cello.arten[].stueckpreis negativ', (c) => { c.cello.arten[1].stueckpreis = -5; }, 'stueckpreis muss eine Zahl ≥ 0'],
    ['cello.arten[].stueckpreis als String', (c) => { c.cello.arten[1].stueckpreis = '0.1'; }, 'stueckpreis muss eine Zahl ≥ 0'],
    ['cello.arten[].stueckpreis fehlt', (c) => delete c.cello.arten[1].stueckpreis, 'stueckpreis muss eine Zahl ≥ 0'],
    ['formate[].offenB als String', (c) => { c.formate[0].offenB = '420'; }, 'offenB muss eine Zahl > 0'],
    ['formate[].nutzenGC 0', (c) => { c.formate[0].nutzenGC = 0; }, 'nutzenGC muss eine Zahl ≥ 1'],
    ['routen[].maxAuflage als String', (c) => { c.routen[1].maxAuflage = '1000'; }, 'maxAuflage muss eine Zahl ≥ 1'],
    ['routen[].minAuflage als String', (c) => { c.routen[1].minAuflage = '10'; }, 'minAuflage muss leer oder eine Zahl ≥ 1'],
    ['routen[].wtStandard als String', (c) => { c.routen[0].wtStandard = '3'; }, 'wtStandard muss eine Zahl ≥ 1'],
    ['settings als String-Zahl', (c) => { c.settings.setupKosten = '15'; }, 'settings.setupKosten'],
    ['maxDickeRef auf String-Setting', (c) => { c.settings.maxDickeGC = '1500'; }, 'maxDickeRef'],
  ])('%s', (_name, mutation, erwartet) => {
    const result = mutiert(mutation);
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain(erwartet);
  });

  it('cello.arten[].stueckpreis 0 ist erlaubt (Art „ohne")', () => {
    expect(getDefaultPricingConfig().cello.arten[0].stueckpreis).toBe(0);
    expect(validatePricingConfig(getDefaultPricingConfig()).ok).toBe(true);
  });
});

describe('M3: maxAuflage gegen die WV-Staffeln, minAuflage ≤ maxAuflage', () => {
  it('Kopp maxAuflage 5000 über der 1000er-Staffel wird abgelehnt (B1 käme per Config zurück)', () => {
    const result = mutiert((c) => { c.routen[1].maxAuflage = 5000; });
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain('maxAuflage (5000) liegt über der höchsten Staffel (1000)');
    expect(fehlerText(result)).toContain('"kopp"');
  });

  it('maxAuflage exakt auf der höchsten Staffel ist erlaubt', () => {
    expect(mutiert((c) => { c.routen[1].maxAuflage = 1000; }).ok).toBe(true);
    expect(mutiert((c) => { c.routen[0].maxAuflage = 500; }).ok).toBe(true);
  });

  it('maxAuflage 0, null, fehlend oder negativ gilt nicht als „unbegrenzt"', () => {
    for (const wert of [0, null, undefined, -1, NaN, Infinity]) {
      const result = mutiert((c) => { c.routen[1].maxAuflage = wert; });
      expect(result.ok, `maxAuflage ${String(wert)}`).toBe(false);
      expect(fehlerText(result)).toContain('maxAuflage muss eine Zahl ≥ 1');
    }
  });

  it('minAuflage über maxAuflage wird abgelehnt (Route wäre still tot)', () => {
    const result = mutiert((c) => { c.routen[1].minAuflage = 2000; });
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain('minAuflage (2000) liegt über maxAuflage (1000)');
    // gleich ist erlaubt
    expect(mutiert((c) => { c.routen[1].minAuflage = 1000; }).ok).toBe(true);
  });

  it('minAuflage 0 wird abgelehnt, null bleibt erlaubt', () => {
    expect(fehlerText(mutiert((c) => { c.routen[0].minAuflage = 0; }))).toContain('minAuflage muss leer oder eine Zahl ≥ 1');
    expect(mutiert((c) => { c.routen[0].minAuflage = null; }).ok).toBe(true);
  });

  it('ILDA: alle vier Tabellen des wvTabelleRef-Objekts werden geprüft', () => {
    // nur die Banner-mit-Tabelle auf 400 kürzen → maxAuflage 500 passt nicht mehr zu genau dieser
    const result = mutiert((c) => {
      for (const row of Object.values(c.wvTabellen.ilda_banner_mit)) delete row[500];
    });
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain('höchsten Staffel (400) der WV-Tabelle "ilda_banner_mit"');
    expect(fehlerText(result)).not.toContain('"ilda_ohneUmschlag"');

    expect(fehlerText(mutiert((c) => { c.routen[2].maxAuflage = 501; }))).toContain('(500) der WV-Tabelle "ilda_mitUmschlag"');
  });

  it('maßgeblich ist die Staffel, die in ALLEN Zeilen hinterlegt ist', () => {
    // Zeile 12 der GC-Tabelle endet bei 400, die anderen bei 500 → Grenze 400
    const result = mutiert((c) => { delete c.wvTabellen.gc_horizon[12][500]; });
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain('maxAuflage (500) liegt über der höchsten Staffel (400)');
  });
});

describe('N1: Werktage sind Pflicht', () => {
  it.each([
    ['wtStandard fehlt', (c) => delete c.routen[0].wtStandard, 'wtStandard'],
    ['wtExpress 0', (c) => { c.routen[0].wtExpress = 0; }, 'wtExpress'],
    ['wtExpress null', (c) => { c.routen[2].wtExpress = null; }, 'wtExpress'],
  ])('%s', (_name, mutation, erwartet) => {
    const result = mutiert(mutation);
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain(`${erwartet} muss eine Zahl ≥ 1`);
  });
});

describe('N2: nicht-monotone WV-Tabellen', () => {
  it('Default-Tabellen sind in beiden Richtungen monoton (Review 12.10.)', () => {
    expect(validatePricingConfig(getDefaultPricingConfig()).ok).toBe(true);
  });

  it('Preis fällt mit steigender Staffel (Tippfehler 1 statt 75) → Fehler', () => {
    const result = mutiert((c) => { c.wvTabellen.gc_horizon[6][200] = 1; });
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain('wvTabellen.gc_horizon[6][200]: Preis 1 fällt gegenüber der kleineren Staffel');
  });

  it('Preis fällt mit mehr Bogenteilen (gleiche Staffel) → Fehler', () => {
    const result = mutiert((c) => {
      c.wvTabellen.kopp[5][100] = c.wvTabellen.kopp[4][100] - 1;
    });
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain('wvTabellen.kopp[5][100]');
    expect(fehlerText(result)).toContain('vorherigen Zeile');
  });

  it('gleiche Preise nebeneinander sind erlaubt (Plateau in beiden Richtungen)', () => {
    const ok = mutiert((c) => {
      c.wvTabellen.test_plateau = {
        2: { 100: 10, 200: 10, 300: 12 },
        3: { 100: 10, 200: 11, 300: 12 },
      };
    });
    expect(ok.ok).toBe(true);
  });

  it('Staffel-/Zeilenschlüssel müssen ganze Zahlen ≥ 1 sein, die die Engine wiederfindet', () => {
    expect(fehlerText(mutiert((c) => { c.wvTabellen.gc_horizon[2]['007'] = 5; }))).toContain('Auflagenstaffeln müssen ganze Zahlen ≥ 1');
    expect(fehlerText(mutiert((c) => { c.wvTabellen.gc_horizon[2]['1.5'] = 5; }))).toContain('Auflagenstaffeln müssen ganze Zahlen ≥ 1');
    expect(fehlerText(mutiert((c) => { c.wvTabellen.gc_horizon.abc = { 100: 5 }; }))).toContain('Bogenteile-Zeilen müssen ganze Zahlen ≥ 1');
    expect(fehlerText(mutiert((c) => { c.wvTabellen.gc_horizon[0] = { 100: 5 }; }))).toContain('Bogenteile-Zeilen müssen ganze Zahlen ≥ 1');
  });
});

describe('N5: wirkungslose umschlagAusnahmen', () => {
  it('Umschlagpapier, das kein Format als Umschlag anbietet → Fehler', () => {
    const c = getDefaultPricingConfig();
    const alleUmschlaege = new Set(c.formate.flatMap((f) => f.papiereUmschlag));
    const nurInhalt = c.papiere.find((p) => !alleUmschlaege.has(p.id));
    expect(nurInhalt).toBeDefined(); // Testvoraussetzung: es gibt ein reines Inhaltspapier
    c.umschlagAusnahmen.R_90.push(nurInhalt.id);
    const result = validatePricingConfig(c);
    expect(result.ok).toBe(false);
    expect(fehlerText(result)).toContain(`umschlagAusnahmen.R_90: Umschlagpapier "${nurInhalt.id}" ist in keinem Format als Umschlag hinterlegt`);
  });

  it('unbekanntes Umschlag-/Inhaltspapier und Nicht-Listen werden weiterhin gemeldet', () => {
    expect(fehlerText(mutiert((c) => { c.umschlagAusnahmen.R_90 = ['GIBT_ES_NICHT']; }))).toContain('unbekanntes Umschlagpapier "GIBT_ES_NICHT"');
    expect(fehlerText(mutiert((c) => { c.umschlagAusnahmen.XX_1 = ['CC_250']; }))).toContain('umschlagAusnahmen.XX_1: unbekanntes Inhaltspapier');
    expect(fehlerText(mutiert((c) => { c.umschlagAusnahmen.R_90 = 'CC_250'; }))).toContain('muss eine Liste von Umschlag-IDs');
    expect(fehlerText(mutiert((c) => { c.umschlagAusnahmen = 'x'; }))).toContain('umschlagAusnahmen: muss ein Objekt');
  });
});

describe('N8: validatePricingConfig wirft nie', () => {
  const UNGEPRUEFT = 'Config konnte nicht geprüft werden';

  it('wvTabellen.x = null bzw. Zeile = null ergibt eine Fehlermeldung statt einer Exception', () => {
    const tabelle = mutiert((c) => { c.wvTabellen.gc_horizon = null; });
    expect(tabelle.ok).toBe(false);
    expect(fehlerText(tabelle)).toContain('wvTabellen.gc_horizon: Tabelle fehlt oder ist kein Objekt');
    expect(fehlerText(tabelle)).not.toContain(UNGEPRUEFT);

    const zeile = mutiert((c) => { c.wvTabellen.gc_horizon[3] = null; });
    expect(zeile.ok).toBe(false);
    expect(fehlerText(zeile)).toContain('wvTabellen.gc_horizon[3]: Zeile fehlt oder ist kein Objekt');
    expect(fehlerText(zeile)).not.toContain(UNGEPRUEFT);

    const leer = mutiert((c) => { c.wvTabellen = null; });
    expect(fehlerText(leer)).toContain('wvTabellen: muss ein Objekt');
  });

  it('Grundgerüst-Fälle: kein Objekt, leere Teile, falsche Typen', () => {
    for (const eingabe of [null, undefined, 42, 'x', [], {}, { meta: null, settings: null, papiere: null, formate: null, routen: null, wvTabellen: null, cello: null }]) {
      const result = validatePricingConfig(eingabe);
      expect(result.ok).toBe(false);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.join('\n')).not.toContain(UNGEPRUEFT);
    }
  });

  // Sweep: jeden Pfad der Default-Config (Listen/Tabellen auf erstes und letztes
  // Element gekürzt) mit typfremden Werten überschreiben. Der Validator muss
  // jedes Mal regulär antworten — der try/catch im Validator darf nicht greifen.
  it('Sweep über alle Pfade der Default-Config mit typfremden Werten', () => {
    const MUELL = [null, undefined, 'x', '67', 0, -1, NaN, true, {}, []];
    const pfade = [];
    const sammle = (value, pfad) => {
      pfade.push(pfad);
      if (Array.isArray(value)) {
        const indizes = value.length > 2 ? [0, value.length - 1] : value.map((_, i) => i);
        for (const i of indizes) sammle(value[i], [...pfad, i]);
      } else if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        const gewaehlt = pfad[0] === 'wvTabellen' && pfad.length >= 2 && keys.length > 2
          ? [keys[0], keys[keys.length - 1]]
          : keys;
        for (const k of gewaehlt) sammle(value[k], [...pfad, k]);
      }
    };
    sammle(getDefaultPricingConfig(), []);
    expect(pfade.length).toBeGreaterThan(150);

    let geprueft = 0;
    for (const pfad of pfade) {
      if (!pfad.length) continue;
      for (const wert of MUELL) {
        const c = getDefaultPricingConfig();
        let ziel = c;
        for (const k of pfad.slice(0, -1)) ziel = ziel[k];
        ziel[pfad[pfad.length - 1]] = wert;
        const result = validatePricingConfig(c);
        geprueft += 1;
        expect(typeof result.ok, pfad.join('.')).toBe('boolean');
        expect(Array.isArray(result.errors), pfad.join('.')).toBe(true);
        expect(result.errors.join('\n'), `${pfad.join('.')} = ${String(wert)}`).not.toContain(UNGEPRUEFT);
        if (result.ok) expect(result.errors).toEqual([]);
      }
    }
    expect(geprueft).toBeGreaterThan(1500);
  });
});

describe('Migration: maxAuflage null aus Ständen vor dem B1-Fix', () => {
  it('Kopp maxAuflage null wird auf die höchste Staffel (1000) aufgefüllt und der Stand bleibt gültig', () => {
    const c = getDefaultPricingConfig();
    c.routen[1].maxAuflage = null;
    delete c.routen[0].maxAuflage;
    const m = migratePricingConfig(c);
    expect(m.routen[1].maxAuflage).toBe(1000);
    expect(m.routen[0].maxAuflage).toBe(500);
    expect(validatePricingConfig(m).ok).toBe(true);
  });

  it('ILDA mit mehreren Tabellen bekommt die kleinste gemeinsame Höchststaffel', () => {
    const c = getDefaultPricingConfig();
    const ilda = c.routen.find((r) => r.key === 'ilda');
    ilda.maxAuflage = null;
    const m = migratePricingConfig(c);
    const tabellen = Object.values(ilda.wvTabelleRef).map((n) => c.wvTabellen[n]);
    const erwartet = Math.min(...tabellen.flatMap((t) => Object.values(t).map((row) => Math.max(...Object.keys(row).map(Number)))));
    expect(m.routen.find((r) => r.key === 'ilda').maxAuflage).toBe(erwartet);
    expect(validatePricingConfig(m).ok).toBe(true);
  });

  it('kaputte Werte (0, String) und fehlende Tabellen werden nicht still repariert', () => {
    const c = getDefaultPricingConfig();
    c.routen[1].maxAuflage = 0;
    c.routen[0].maxAuflage = '500';
    const m = migratePricingConfig(c);
    expect(m.routen[1].maxAuflage).toBe(0);
    expect(m.routen[0].maxAuflage).toBe('500');
    expect(validatePricingConfig(m).ok).toBe(false);
    const d = getDefaultPricingConfig();
    d.routen[1].maxAuflage = null;
    d.routen[1].wvTabelleRef = 'gibt_es_nicht';
    expect(migratePricingConfig(d).routen[1].maxAuflage).toBeNull();
  });

  it('ohne Änderungsbedarf kommt dasselbe Objekt zurück', () => {
    const c = getDefaultPricingConfig();
    expect(migratePricingConfig(c)).toBe(c);
  });
});

describe('M5: getPendingPublish migriert vor der Validierung', () => {
  const speicher = new Map();
  const fakeStorage = {
    getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
    setItem: (k, v) => speicher.set(k, String(v)),
    removeItem: (k) => speicher.delete(k),
  };

  afterEach(() => {
    speicher.clear();
    vi.unstubAllGlobals();
  });

  it('ein Pending aus einer Version vor 2.6.0 wird nach dem Deploy nicht still verworfen', () => {
    vi.stubGlobal('localStorage', fakeStorage);
    const alt = getDefaultPricingConfig();
    for (const key of Object.keys(alt.settings)) {
      if (key.startsWith('kleinmengen')) delete alt.settings[key];
    }
    alt.settings.setupKosten = 17; // die eigentliche, noch nicht veröffentlichte Änderung
    setPendingPublish(alt);

    const pending = getPendingPublish();
    expect(pending).not.toBeNull();
    expect(pending.settings.setupKosten).toBe(17);
    expect(pending.settings.kleinmengenBisAuflage).toBe(getDefaultPricingConfig().settings.kleinmengenBisAuflage);
  });

  it('ein wirklich ungültiger Pending bleibt null', () => {
    vi.stubGlobal('localStorage', fakeStorage);
    const kaputt = getDefaultPricingConfig();
    kaputt.routen[1].maxAuflage = 5000;
    setPendingPublish(kaputt);
    expect(getPendingPublish()).toBeNull();
  });
});
