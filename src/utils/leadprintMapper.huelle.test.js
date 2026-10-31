// Sicherheitshülle (Befund 1, Umschlagartikel-Plan.md, 31.10.2026): Leadprint
// interpoliert zwischen Staffeln linear; die Hülle hebt die Staffelwerte so an,
// dass die Gerade nie unter dem Engine-Preis liegt. Dieser Dauertest ist die
// reduzierte Form der Messung (voll: Scratchpad messHuelle.mjs, 77 + 50 Zeilen,
// alle Mengen 1–1000, 9.190 Vergleichskurven, 28 s). Ergebnis der vollen
// Messung 31.10.2026 (Raster B, 151 Staffeln):
//   ohne U (50 Zeilen, 29 Seiten, 933.031 Mengen): zu billig 0, > 5 € zu teuer
//     0,195 %, Ø +0,18 €, max +27,20 €; ohne Hülle 383 Mengen > 5 € zu billig (−18,30 €)
//   mit U (77 Zeilen, 30 Seiten × 1/1|4/4 × ohne|matt, 4,5 Mio. Mengen):
//     1/1 ohne Cello: zu billig 0, > 5 € 0,254 %, Ø +0,33 €, max +27,50 €
//     Mischkombinationen (alleSeiten): 5 Mengen 1 Cent zu billig (4/4 + Cello),
//     > 5 € 0,280 %, Ø +1,08 €; basisSeiten: 187 Mengen 1 Cent zu billig.
import { describe, expect, it } from 'vitest';
import mapping from '../data/leadprintMapping.rst.json';
import { getDefaultPricingConfig } from './pricingConfig';
import { calculateRSTPrice } from './calculateRSTPrice';
import {
  SEITEN_STUETZSTELLEN,
  computeInhaltZeile,
  computeInhaltZeilen,
  computeUmschlagZeile,
  computeUmschlagZeilen,
  huelleStaffelwerte,
} from './leadprintMapper';

const config = getDefaultPricingConfig();
const STAFFELN = mapping.auflagen;
const QMAX = Math.max(...STAFFELN);
const SEITEN_MIT = [4, ...SEITEN_STUETZSTELLEN];
const cent = (x) => Math.round(x * 100) / 100;

function engine(inp) {
  const { validResults, recommendedName } = calculateRSTPrice({ produktionszeit: 'standard', ...inp }, config);
  const r = validResults.find((x) => x.name === recommendedName);
  return r ? r.gesamt : null;
}

// Shop-Preis an Menge q: Zellwert an der Staffel, dazwischen linear
function shopPreis(Z, q) {
  let i = 0;
  while (i < STAFFELN.length - 1 && STAFFELN[i + 1] <= q) i += 1;
  if (STAFFELN[i] === q) return Z[i];
  if (Z[i] == null || Z[i + 1] == null) return null;
  return Z[i] + ((Z[i + 1] - Z[i]) * (q - STAFFELN[i])) / (STAFFELN[i + 1] - STAFFELN[i]);
}

function statistik() {
  return { n: 0, zuBillig: 0, maxBillig: 0, teuer5: 0, summe: 0, max: 0 };
}
function vergleiche(stat, Z, kurve) {
  for (let q = 1; q <= QMAX; q += 1) {
    const e = kurve[q];
    const s = shopPreis(Z, q);
    if (e == null || s == null) continue;
    const d = cent(s) - e;
    stat.n += 1;
    stat.summe += d;
    if (d < -0.005) { stat.zuBillig += 1; stat.maxBillig = Math.min(stat.maxBillig, d); }
    if (d > 5) stat.teuer5 += 1;
    if (d > stat.max) stat.max = d;
  }
}

describe('Sicherheitshülle: huelleStaffelwerte', () => {
  it('lineare Kurve braucht keinen Lift, Werte werden auf den Cent aufgerundet', () => {
    const kurve = [null, ...Array.from({ length: 10 }, (_, i) => 10 + 2 * i + 0.001)]; // q=1..10
    const { werte, lift } = huelleStaffelwerte(kurve, [1, 5, 10]);
    expect(lift).toEqual([0, 0, 0]);
    expect(werte).toEqual([10.01, 18.01, 28.01]);
  });

  it('Buckel zwischen zwei Staffeln hebt beide Enden um das Defizit, die Sehne liegt dann nie unter der Kurve', () => {
    const kurve = [null, 10, 10, 10, 20, 10, 10, 10, 10, 10, 10]; // Spitze bei q=4 → Defizit 10
    const { werte, lift } = huelleStaffelwerte(kurve, [1, 7, 10]);
    expect(lift[0]).toBeCloseTo(10, 8);
    expect(lift[1]).toBeCloseTo(10, 8);
    expect(lift[2]).toBe(0);
    expect(werte).toEqual([20, 20, 10]);
    for (let q = 1; q <= 10; q += 1) {
      const i = q <= 7 ? 0 : 1;
      const [lo, hi] = [[1, 7], [7, 10]][i];
      const sehne = werte[i] + ((werte[i + 1] - werte[i]) * (q - lo)) / (hi - lo);
      expect(sehne).toBeGreaterThanOrEqual(kurve[q] - 1e-9);
    }
  });

  it('unbepreistes Intervallende: kein Lift, die Staffel bleibt null', () => {
    const kurve = [null, 10, 10, 50, 10, null];
    const { werte, lift } = huelleStaffelwerte(kurve, [1, 4, 5]);
    expect(lift[0]).toBeGreaterThan(0);
    expect(lift[1]).toBeGreaterThan(0);
    expect(lift[2]).toBe(0);
    expect(werte[2]).toBeNull();
    // konkave Kurve (unter der Sehne) → kein Lift
    expect(huelleStaffelwerte([null, 10, 11, 12, 20], [1, 4]).lift).toEqual([0, 0]);
  });
});

describe('Sicherheitshülle: Staffelraster B', () => {
  it('151 Staffeln, aufsteigend, ohne Dubletten, Grenzstaffeln 99/501 und alte 20 enthalten', () => {
    expect(STAFFELN).toHaveLength(151);
    expect([...STAFFELN].sort((a, b) => a - b)).toEqual(STAFFELN);
    expect(new Set(STAFFELN).size).toBe(151);
    for (const a of [1, 2, 3, 4, 5, 10, 20, 50, 99, 100, 200, 300, 400, 500, 501, 600, 700, 800, 900, 1000]) expect(STAFFELN).toContain(a);
    for (let a = 80; a <= 300; a += 2) expect(STAFFELN).toContain(a);
    for (let a = 310; a <= 500; a += 10) expect(STAFFELN).toContain(a);
    for (let a = 550; a <= 1000; a += 50) expect(STAFFELN).toContain(a);
    expect(STAFFELN.filter((a) => a > 5 && a < 80)).toEqual([10, 20, 50]);
    expect(mapping.meta.staffelraster).toContain('Raster B');
  });
});

describe('Sicherheitshülle: Hülle aus = alte Werte', () => {
  it('computeInhaltZeilen ohne Hülle liefert je Staffel genau computeInhaltZeile', () => {
    const zeilen = computeInhaltZeilen({ config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'CC_160', auflagen: STAFFELN, huelle: false });
    expect(zeilen).toHaveLength(151);
    for (const a of [1, 10, 84, 100, 150, 300, 501, 1000]) {
      const z = zeilen.find((x) => x.auflage === a);
      const einzel = computeInhaltZeile({ config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'CC_160', auflage: a });
      expect(z.liftBasis).toBe(0);
      expect(z).toEqual(einzel);
      expect(z.basisPreis).toBeCloseTo(engine({ formatKey: 'A4_Hoch', auflage: a, seiten: 8, pInhaltId: 'CC_160', dInhaltKey: '4c', hasUmschlag: false, pUmschlagId: '', dUmschlagKey: '4c', celloUmschlag: 'ohne' }), 8);
    }
  });

  it('computeUmschlagZeilen ohne Hülle (basisSeiten) liefert je Staffel genau computeUmschlagZeile', () => {
    const args = { config, formatKey: 'A4_Hoch', farbigkeit: '4c', pInhaltId: 'CC_120', pUmschlagId: 'CC_300', seitenListe: SEITEN_MIT };
    const zeilen = computeUmschlagZeilen({ ...args, auflagen: STAFFELN, huelle: false, aufschlagVariante: 'basisSeiten' });
    expect(zeilen).toHaveLength(151);
    for (const a of [1, 10, 100, 250, 300, 501, 1000]) {
      expect(zeilen.find((x) => x.auflage === a)).toEqual(computeUmschlagZeile({ ...args, auflage: a }));
    }
    expect(() => computeUmschlagZeilen({ ...args, auflagen: [100], aufschlagVariante: 'quatsch' })).toThrow('aufschlagVariante');
  });
});

describe('Sicherheitshülle: Shop nie unter der Engine (Stichprobe, alle ganzen Mengen 1–1000)', () => {
  it('ohne Umschlag: zwei Zeilen × alle 29 Seitenzahlen — 0 zu billig, Ø-Fehler klein', () => {
    const stat = statistik();
    const roh = statistik();
    for (const [formatKey, farbigkeit, pInhaltId] of [['A4_Hoch', '4c', 'CC_160'], ['A6_Hoch', '1c', 'N_80']]) {
      const args = { config, formatKey, farbigkeit, pInhaltId, auflagen: STAFFELN };
      const mit = new Map(computeInhaltZeilen(args).map((z) => [z.auflage, z]));
      const ohne = new Map(computeInhaltZeilen({ ...args, huelle: false }).map((z) => [z.auflage, z]));
      // Struktur unverändert: gleiche Staffeln, gleiche Leerzellen, Routen und Liefertage aus der Engine
      expect([...mit.keys()]).toEqual([...ohne.keys()]);
      for (const [a, z] of mit) {
        const o = ohne.get(a);
        expect([z.route, z.produktionszeitWT, z.produktionszeitWTMax, z.routenSeiten]).toEqual([o.route, o.produktionszeitWT, o.produktionszeitWTMax, o.routenSeiten]);
        for (const s of SEITEN_STUETZSTELLEN.slice(1)) expect(z.aufschlaege[s] === null).toBe(o.aufschlaege[s] === null);
      }
      for (const s of SEITEN_STUETZSTELLEN) {
        const kurve = new Array(QMAX + 1).fill(null);
        for (let q = 1; q <= QMAX; q += 1) kurve[q] = engine({ formatKey, auflage: q, seiten: s, pInhaltId, dInhaltKey: farbigkeit, hasUmschlag: false, pUmschlagId: '', dUmschlagKey: farbigkeit, celloUmschlag: 'ohne' });
        const zelle = (z) => { if (!z) return null; const x = s === 8 ? 0 : z.aufschlaege[s]; return x == null ? null : z.basisPreis + x; };
        vergleiche(stat, STAFFELN.map((a) => zelle(mit.get(a))), kurve);
        vergleiche(roh, STAFFELN.map((a) => zelle(ohne.get(a))), kurve);
      }
    }
    expect(stat.n).toBeGreaterThan(30000);
    expect(stat.zuBillig).toBe(0);
    expect(stat.summe / stat.n).toBeLessThan(1);
    expect(stat.teuer5 / stat.n).toBeLessThan(0.01);
    // ohne Hülle ist der Shop an Zwischenmengen tatsächlich zu billig (Befund 1)
    expect(roh.zuBillig).toBeGreaterThan(0);
    expect(roh.maxBillig).toBeLessThan(-1);
  });

  it('mit Umschlag: zwei Zeilen × 30 Seitenzahlen × 1/1|4/4 × ohne|matt — 1/1 ohne Cello 0 zu billig, Mischkombinationen höchstens um Cent-Rundung', () => {
    const rein = statistik();
    const misch = statistik();
    const basisSeiten = statistik();
    for (const [formatKey, farbigkeit, pInhaltId, pUmschlagId] of [['A4_Hoch', '4c', 'CC_120', 'CC_300'], ['A6_Hoch', '4c', 'N_120', 'N_300']]) {
      const args = { config, formatKey, farbigkeit, pInhaltId, pUmschlagId, auflagen: STAFFELN, seitenListe: SEITEN_MIT };
      const alle = new Map(computeUmschlagZeilen(args).map((z) => [z.auflage, z]));
      const basis = new Map(computeUmschlagZeilen({ ...args, aufschlagVariante: 'basisSeiten' }).map((z) => [z.auflage, z]));
      const celloErlaubt = alle.get(100).veredelungMoeglich;
      const zelle = (z, s, dU, c) => {
        if (!z) return null;
        const aS = s === 4 ? 0 : z.aufschlaegeSeiten[s];
        const aF = dU === '4c' ? z.aufschlagFarbigkeitUmschlag : 0;
        const aV = c === 'ohne' ? 0 : z.aufschlaegeVeredelung[c];
        return aS == null || aF == null || aV == null ? null : z.basisPreis + aS + aF + aV;
      };
      for (const s of SEITEN_MIT) for (const dU of ['1c', '4c']) for (const c of celloErlaubt ? ['ohne', 'matt'] : ['ohne']) {
        const kurve = new Array(QMAX + 1).fill(null);
        for (let q = 1; q <= QMAX; q += 1) kurve[q] = engine({ formatKey, auflage: q, seiten: s, pInhaltId, dInhaltKey: farbigkeit, hasUmschlag: true, pUmschlagId, dUmschlagKey: dU, celloUmschlag: c });
        const istRein = dU === '1c' && c === 'ohne';
        vergleiche(istRein ? rein : misch, STAFFELN.map((a) => zelle(alle.get(a), s, dU, c)), kurve);
        if (!istRein) vergleiche(basisSeiten, STAFFELN.map((a) => zelle(basis.get(a), s, dU, c)), kurve);
      }
    }
    expect(rein.n).toBeGreaterThan(25000);
    expect(rein.zuBillig).toBe(0);
    expect(rein.summe / rein.n).toBeLessThan(1);
    expect(misch.n).toBeGreaterThan(60000);
    // Mischkombinationen: die Engine ist nicht additiv (Makulatur am Gesamtvolumen);
    // Restabweichung höchstens eine Cent-Rundung, und seltener als bei basisSeiten
    expect(misch.maxBillig).toBeGreaterThanOrEqual(-0.011);
    expect(misch.zuBillig / misch.n).toBeLessThan(0.0005);
    expect(misch.zuBillig).toBeLessThanOrEqual(basisSeiten.zuBillig);
    expect(misch.summe / misch.n).toBeLessThan(2.5);
    expect(misch.teuer5 / misch.n).toBeLessThan(0.02);
  });
});
