import { describe, expect, it, vi } from 'vitest';
import { calculateRSTPrice, getCoverPaperOptions } from './calculateRSTPrice';
import { getDefaultPricingConfig } from './pricingConfig';

// Sweeps rechnen tausende Zellen; unter Systemlast (Load > 100 beobachtet)
// dauern sie statt ~0,5 s auch 10 s — das Standard-Limit von 5 s wäre dann
// ein Fehlalarm. Ergebnis zählt, nicht die Zeit.
vi.setConfig({ testTimeout: 120_000 });

// Dauerhafte Kurzfassung der Bug-Hunt-V5-Sweeps (12.10.2026). Der Vollsweep
// (495.080 Aufrufe, 0 Anomalien) ist zu lang für jeden Testlauf; hier läuft eine
// feste, per Seed reproduzierbare Stichprobe der Konfigurationen in wenigen
// hundert Millisekunden. Geprüft wird je Route:
//  - Gesamtpreis steigt mit der Auflage (grobes Raster streng, lückenlos mit
//    Toleranz für den bekannten Makulatur-Rundungseffekt, max. 0,415 €),
//  - Gesamtpreis steigt mit der Seitenzahl,
//  - kein Schema-Drift: gültige Ergebnisse sind endliche Zahlen > 0, Werktage gesetzt,
//  - Staffelgrenzen (500/501 GC+ILDA, 1000/1001 Kopp, 99/100 ILDA-Standard).

const config = getDefaultPricingConfig();

// mulberry32 — kleiner, deterministischer Zufallsgenerator (fester Seed)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stichprobe(liste, anzahl, seed) {
  const zufall = rng(seed);
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(zufall() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie.slice(0, anzahl);
}

// Alle Produktkonfigurationen (Format × Farbe × Inhalt × Umschlag × Cello),
// ohne Auflage/Seiten — daraus wird die Stichprobe gezogen.
function alleKonfigurationen() {
  const liste = [];
  for (const format of config.formate) {
    for (const farbe of ['1c', '4c']) {
      for (const pInhaltId of format.papiereInhalt) {
        liste.push({ formatKey: format.key, dInhaltKey: farbe, dUmschlagKey: farbe, pInhaltId, hasUmschlag: false, pUmschlagId: '', celloUmschlag: 'ohne' });
        for (const cover of getCoverPaperOptions(config, format.key, pInhaltId)) {
          for (const celloUmschlag of ['ohne', 'matt']) {
            liste.push({ formatKey: format.key, dInhaltKey: farbe, dUmschlagKey: farbe, pInhaltId, hasUmschlag: true, pUmschlagId: cover.id, celloUmschlag });
          }
        }
      }
    }
  }
  return liste;
}

const ALLE = alleKonfigurationen();
const PROBE = stichprobe(ALLE, 80, 20261012);

function rechne(konf, auflage, seiten, produktionszeit = 'standard') {
  return calculateRSTPrice({ ...konf, auflage: String(auflage), seiten: String(seiten), produktionszeit }, config);
}

function beschreibe(konf, auflage, seiten, routeKey) {
  return `${routeKey} ${konf.formatKey} ${konf.dInhaltKey} ${konf.pInhaltId}${konf.hasUmschlag ? `+${konf.pUmschlagId}/${konf.celloUmschlag}` : ''} ${seiten} S. × ${auflage}`;
}

// Schema-Drift: jedes Ergebnis ist entweder ein Fehlerstring oder ein
// vollständiger Zahlensatz — nie NaN, nie String-Preise, nie error: null ohne Preis.
function pruefeErgebnis(result, kontext) {
  if (result.error !== null) {
    expect(typeof result.error, kontext).toBe('string');
    expect(result.gesamt, kontext).toBeUndefined();
    return false;
  }
  expect(typeof result.gesamt, kontext).toBe('number');
  expect(Number.isFinite(result.gesamt) && result.gesamt > 0, kontext).toBe(true);
  expect(Number.isFinite(result.stueckPreis) && result.stueckPreis > 0, kontext).toBe(true);
  expect(Number.isFinite(result.produktionszeitWT) && result.produktionszeitWT >= 1, kontext).toBe(true);
  for (const feld of ['wvKosten', 'kostenPapierGesamt', 'kostenKlickGesamt', 'celloKosten', 'umschlagZuschlag', 'dickenAufschlag', 'kleinmengenAnker', 'weightTotalKg']) {
    expect(Number.isFinite(result[feld]), `${kontext} ${feld}`).toBe(true);
  }
  return true;
}

// Bekannter, bewusst nicht gefixter Effekt: Makulaturbogen werden kaufmännisch
// gerundet; bei +1 Exemplar kann ein Bogen wegfallen (gemessen max. 0,415 €,
// A6 mit Umschlag). Auf dem groben Raster (Schritt ≥ 10 Ex.) gilt streng.
const MAKULATUR_RUNDUNG = 0.5;

const AUFLAGEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 30, 49, 50, 51, 75, 99, 100, 101, 150, 200, 250, 300, 400, 499, 500, 501, 600, 750, 999, 1000, 1001];
const SEITEN = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 100];

describe('Sweep: Monotonie über die Auflage (Stichprobe 80 Konfigurationen × 3 Seitenzahlen)', () => {
  it('Gesamtpreis fällt nie mit mehr Exemplaren (je Route)', () => {
    let gueltige = 0;
    for (const konf of PROBE) {
      for (const seiten of [8, 24, 48]) {
        const letzter = {}; // routeKey → { auflage, gesamt }
        for (const auflage of AUFLAGEN) {
          for (const result of rechne(konf, auflage, seiten).results) {
            const kontext = beschreibe(konf, auflage, seiten, result.key);
            if (!pruefeErgebnis(result, kontext)) continue;
            gueltige += 1;
            const vorher = letzter[result.key];
            if (vorher) {
              const toleranz = auflage - vorher.auflage >= 10 ? 1e-9 : MAKULATUR_RUNDUNG;
              expect(result.gesamt, `${kontext} (vorher ${vorher.auflage}: ${vorher.gesamt.toFixed(2)})`).toBeGreaterThanOrEqual(vorher.gesamt - toleranz);
            }
            letzter[result.key] = { auflage, gesamt: result.gesamt };
          }
        }
      }
    }
    expect(gueltige).toBeGreaterThan(2000);
  });
});

describe('Sweep: Monotonie über die Seitenzahl (Stichprobe 80 Konfigurationen × 4 Auflagen)', () => {
  it('Gesamtpreis fällt nie mit mehr Seiten (je Route, auch im Kassen-Anker-Bereich)', () => {
    let gueltige = 0;
    for (const konf of PROBE) {
      for (const auflage of [1, 5, 10, 100, 500]) {
        const letzter = {};
        for (const seiten of SEITEN) {
          for (const result of rechne(konf, auflage, seiten).results) {
            const kontext = beschreibe(konf, auflage, seiten, result.key);
            if (!pruefeErgebnis(result, kontext)) continue;
            gueltige += 1;
            const vorher = letzter[result.key];
            if (vorher) {
              expect(result.gesamt, `${kontext} (vorher ${vorher.seiten} S.: ${vorher.gesamt.toFixed(2)})`).toBeGreaterThanOrEqual(vorher.gesamt - 1e-9);
            }
            letzter[result.key] = { seiten, gesamt: result.gesamt };
          }
        }
      }
    }
    expect(gueltige).toBeGreaterThan(1500);
  });
});

describe('Sweep: lückenlos 1 → 200 Exemplare (Stichprobe 8 Konfigurationen)', () => {
  it('nur der bekannte Makulatur-Rundungseffekt, kein Sprung an Staffel- oder Ankergrenzen', () => {
    const probe = stichprobe(ALLE, 8, 7);
    let groessterRueckgang = 0;
    for (const konf of probe) {
      for (const seiten of [16, 32]) {
        const letzter = {};
        for (let auflage = 1; auflage <= 200; auflage += 1) {
          for (const result of rechne(konf, auflage, seiten).results) {
            const kontext = beschreibe(konf, auflage, seiten, result.key);
            if (!pruefeErgebnis(result, kontext)) continue;
            const vorher = letzter[result.key];
            if (vorher !== undefined) {
              const rueckgang = vorher - result.gesamt;
              groessterRueckgang = Math.max(groessterRueckgang, rueckgang);
              expect(rueckgang, kontext).toBeLessThanOrEqual(MAKULATUR_RUNDUNG);
            }
            letzter[result.key] = result.gesamt;
          }
        }
      }
    }
    expect(groessterRueckgang).toBeLessThanOrEqual(MAKULATUR_RUNDUNG);
  });
});

describe('Sweep: Staffelgrenzen und Express (alle Konfigurationen, A4 Hoch 4/4)', () => {
  const a4 = ALLE.filter((k) => k.formatKey === 'A4_Hoch' && k.dInhaltKey === '4c' && k.celloUmschlag === 'ohne');
  const route = (konf, auflage, seiten, key, produktionszeit) =>
    rechne(konf, auflage, seiten, produktionszeit).results.find((r) => r.key === key);

  it('GC und ILDA enden bei 500, Kopp bei 1000; ILDA-Standard beginnt bei 100', () => {
    expect(a4.length).toBeGreaterThan(20);
    for (const konf of a4) {
      const seiten = 16;
      if (route(konf, 500, seiten, 'gc_horizon').error === null) {
        expect(route(konf, 501, seiten, 'gc_horizon').error).toContain('maximal 500');
      }
      if (route(konf, 500, seiten, 'ilda').error === null) {
        expect(route(konf, 501, seiten, 'ilda').error).toContain('maximal 500');
        expect(route(konf, 99, seiten, 'ilda').error).toContain('nicht in Preistabelle');
        expect(route(konf, 100, seiten, 'ilda').error).toBeNull();
      }
      if (route(konf, 1000, seiten, 'kopp').error === null) {
        expect(route(konf, 1001, seiten, 'kopp').error).toContain('maximal 1000');
        expect(route(konf, 9, seiten, 'kopp').error).toContain('erst ab 10');
      }
    }
  });

  it('Express = Standard × (1 + expressFaktor), Werktage je Route', () => {
    for (const konf of stichprobe(a4, 10, 3)) {
      for (const auflage of [1, 10, 100, 500]) {
        for (const r of config.routen) {
          const std = route(konf, auflage, 24, r.key, 'standard');
          const exp = route(konf, auflage, 24, r.key, 'express');
          if (std.error !== null) {
            expect(exp.error).toBe(std.error);
            continue;
          }
          expect(exp.gesamt).toBeCloseTo(std.gesamt * (1 + config.settings.expressFaktor), 8);
          expect(std.produktionszeitWT).toBe(r.wtStandard);
          expect(exp.produktionszeitWT).toBe(r.wtExpress);
        }
      }
    }
  });
});
