import { calculateRSTPrice, getCoverPaperOptions } from './calculateRSTPrice';

// Seitenzahlen, die als Listenwerte im Optionsfeld "Seitenanzahl Innenteil" (5628)
// angelegt sind (siehe leadprintMapping.rst.json → optionsfelder).
export const SEITEN_STUETZSTELLEN = Array.from({ length: 29 }, (_, i) => 8 + i * 4);

// Aufschlag-Varianten für Umschlag-Farbigkeit und Veredelung (nur mit Hülle
// relevant, siehe computeUmschlagZeilen):
//   alleSeiten  – Aufschlag an der Staffel = Maximum über alle Seitenzahlen der
//                 Differenz gehüllter Kurven (4/4 − 1/1 bzw. Cello − ohne) →
//                 jede Mischkombination ist an den Staffeln mindestens so teuer
//                 wie ihre eigene Hülle
//   basisSeiten – Differenz nur an der Basis-Seitenzahl (wie vor der Hülle)
// Gemessen 31.10.2026 (77 Zeilen, 30 Seiten × 1/1|4/4 × ohne|matt, alle
// Mengen 1–1000, 4,5 Mio. Vergleiche; Dauertest in reduzierter Form:
// leadprintMapper.huelle.test.js): 1/1 ohne Cello in beiden Varianten 0 zu
// billig; Mischkombinationen alleSeiten 5 Mengen um 1 Cent zu billig (nur
// 4/4 + Cello, Makulatur hängt am Gesamtvolumen), basisSeiten 187 Mengen;
// Ø-Fehler praktisch gleich (+1,08 € / +1,08 €) → Standard ist alleSeiten.
export const AUFSCHLAG_VARIANTEN = ['alleSeiten', 'basisSeiten'];
export const AUFSCHLAG_VARIANTE_STANDARD = 'alleSeiten';

function formatByKey(config, key) {
  return config.formate.find((f) => f.key === key) ?? null;
}

function paperById(config, id) {
  return config.papiere.find((p) => p.id === id) ?? null;
}

function preis(config, inputs) {
  const { validResults, recommendedName } = calculateRSTPrice(inputs, config);
  const route = validResults.find((r) => r.name === recommendedName) ?? null;
  if (!route) return null;
  return { gesamt: route.gesamt, routeName: route.name, produktionszeitWT: route.produktionszeitWT };
}

// ---------------------------------------------------------------------------
// Sicherheitshülle (Befund 1, Umschlagartikel-Plan.md, 31.10.2026)
//
// Leadprint rechnet freie Mengen zwischen zwei Staffeln LINEAR. Die Engine ist
// dort nicht linear (Dickenaufschlag ab 80 Ex., Routenwechsel GC → Kopp → ILDA,
// Verarbeitungsstaffeln der Partner) — die Sehne zwischen zwei Staffelpreisen
// läuft stellenweise unter der echten Kurve, der Shop wäre zu billig (gemessen
// bis −57 €). Die Hülle hebt die Staffelwerte so weit an, dass die Sehne
// zwischen zwei Nachbarstaffeln nie unter dem echten Preis liegt:
//   je Intervall [lo, hi] mit bepreisten Enden: Defizit = max über ganze q in
//   (lo, hi) von k(q) − Sehne(q); lift[lo] = max(lift[lo], Defizit), ebenso hi.
//   Zellwert an Staffel a = k(a) + lift[a], auf den Cent AUFgerundet (die
//   Builder-Rundung darf nie unter die Hülle fallen).
// Ist ein Ende unbepreist (null), gibt es keinen Lift — Leadprint blendet die
// Option dann ohnehin aus. Beweis der Sicherheit: die neue Sehne ist die alte
// plus (1−t)·lift[lo] + t·lift[hi] ≥ alte Sehne + Defizit ≥ k(q).
// ---------------------------------------------------------------------------

function centAufgerundet(wert) {
  // 1e-9: Gleitkomma-Rauschen (z. B. 12.3000000001) nicht auf den nächsten Cent heben
  return Math.ceil(wert * 100 - 1e-9) / 100;
}

// kurve: Array, Index = Menge (1 … qMax), Wert = Engine-Preis oder null.
// Rückgabe: { werte: [je Staffel: gehüllter Preis | null], lift: [je Staffel] }
export function huelleStaffelwerte(kurve, staffeln) {
  const lift = new Array(staffeln.length).fill(0);
  for (let i = 0; i < staffeln.length - 1; i += 1) {
    const lo = staffeln[i];
    const hi = staffeln[i + 1];
    const plo = kurve[lo];
    const phi = kurve[hi];
    if (plo == null || phi == null) continue;
    let defizit = 0;
    for (let q = lo + 1; q < hi; q += 1) {
      const kq = kurve[q];
      if (kq == null) continue;
      const sehne = plo + ((phi - plo) * (q - lo)) / (hi - lo);
      if (kq - sehne > defizit) defizit = kq - sehne;
    }
    if (defizit > lift[i]) lift[i] = defizit;
    if (defizit > lift[i + 1]) lift[i + 1] = defizit;
  }
  const werte = staffeln.map((a, i) => (kurve[a] == null ? null : centAufgerundet(kurve[a] + lift[i])));
  return { werte, lift };
}

// Kurven-Cache für EIN Inhaltspapier (bzw. Inhalt × Umschlag): rechnet je
// Variante (Seiten, Umschlag-Farbigkeit, Cello) die Engine an allen ganzen
// Mengen 1 … max(Staffel) (mit Hülle) oder nur an den Staffeln (ohne Hülle) und
// liefert daraus die Zellwerte je Staffel. Basis- und Aufschlagskurven teilen
// sich so jeden Engine-Aufruf (~2 µs; ohne-U-Artikel ≈ 13 Papiere × 29 Kurven ×
// 1000 Mengen ≈ 380.000 Aufrufe, rund eine Sekunde).
function kurvenCache({ config, gemeinsam, auflagen, huelle }) {
  const qMax = Math.max(...auflagen);
  const staffelSet = new Set(auflagen);
  const cache = new Map();
  return (variante) => {
    const key = `${variante.seiten}|${variante.dUmschlagKey ?? ''}|${variante.celloUmschlag ?? ''}`;
    if (!cache.has(key)) {
      const anStaffel = new Map();
      let werte;
      let lift;
      if (huelle) {
        const kurve = new Array(qMax + 1).fill(null);
        for (let q = 1; q <= qMax; q += 1) {
          const r = preis(config, { ...gemeinsam, ...variante, auflage: q });
          kurve[q] = r ? r.gesamt : null;
          if (staffelSet.has(q)) anStaffel.set(q, r);
        }
        ({ werte, lift } = huelleStaffelwerte(kurve, auflagen));
      } else {
        for (const a of auflagen) anStaffel.set(a, preis(config, { ...gemeinsam, ...variante, auflage: a }));
        werte = auflagen.map((a) => anStaffel.get(a)?.gesamt ?? null);
        lift = auflagen.map(() => 0);
      }
      cache.set(key, { werte, lift, anStaffel });
    }
    return cache.get(key);
  };
}

// Aufschlag = gehüllter Zellwert − gehüllte Basis; nie negativ (ein negativer
// Aufschlag entstünde, wenn die Basis stärker gehoben wurde als die Zelle —
// auf 0 geklemmt bleibt die Zelle ≥ ihrer eigenen Hülle, also sicher).
function aufschlag(zellwert, basis) {
  if (zellwert == null || basis == null) return null;
  return Math.max(0, zellwert - basis);
}

// Preiszeilen für ein Inhaltspapier × ALLE Auflagenstaffeln (ohne Umschlag):
// Basispreis bei der kleinsten Seitenzahl + additive Aufschläge je weiterer
// Seitenzahl-Stützstelle. Jeder einzelne Aufschlag ist die Differenz zweier
// vollständig gerechneter (und gehüllter) Kurven — damit ist jede Seitenzahl
// für sich an den Staffeln exakt die Hülle ihrer eigenen Kurve, die Summe
// Basis + Aufschlag liegt zwischen den Staffeln nie unter dem Engine-Preis.
// Ohne Hülle (huelle: false) sind die Zellen exakt die Engine-Preise an der
// Staffel (zellgenau gegen RST-Rechner-Export.md verifiziert).
// Stützstellen ohne mögliche Route liefern bewusst `null`; im Shop müssen daraus
// LEERE Zellen werden (Leadprint blendet Optionen ohne Preis aus), niemals 0.
export function computeInhaltZeilen({ config, formatKey, farbigkeit, pInhaltId, auflagen, seitenListe = SEITEN_STUETZSTELLEN, huelle = true }) {
  if (!auflagen?.length) return [];
  const basisSeiten = seitenListe[0];
  const gemeinsam = {
    formatKey, pInhaltId, dInhaltKey: farbigkeit,
    hasUmschlag: false, pUmschlagId: '', dUmschlagKey: farbigkeit, celloUmschlag: 'ohne', produktionszeit: 'standard',
  };
  const kurve = kurvenCache({ config, gemeinsam, auflagen, huelle });
  const basis = kurve({ seiten: basisSeiten });
  const seitenKurven = seitenListe.slice(1).map((seiten) => [seiten, kurve({ seiten })]);

  const zeilen = [];
  auflagen.forEach((auflage, i) => {
    const b = basis.anStaffel.get(auflage);
    if (!b || basis.werte[i] == null) return;
    // Je Seiten-Stützstelle merken wir uns neben dem Aufschlag auch Route und
    // Produktionszeit der Zelle: Die Preiszeile im Shop (Papier × Auflage) kann
    // nur EINEN Liefertermin tragen, und der muss für jede Zelle der Zeile
    // reichen → produktionszeitWTMax = längste Produktionszeit über alle Zellen
    // (Entscheidung „Zeilenmaximum", 10.10.2026: ILDA-Zellen brauchen 4 WT).
    const aufschlaege = {};
    const routenSeiten = { [basisSeiten]: b.routeName };
    let produktionszeitWTMax = b.produktionszeitWT;
    for (const [seiten, k] of seitenKurven) {
      const p = k.anStaffel.get(auflage);
      aufschlaege[seiten] = aufschlag(k.werte[i], basis.werte[i]);
      routenSeiten[seiten] = p ? p.routeName : null;
      if (p && p.produktionszeitWT > produktionszeitWTMax) produktionszeitWTMax = p.produktionszeitWT;
    }
    zeilen.push({
      pInhaltId, auflage, basisSeiten, basisPreis: basis.werte[i], liftBasis: basis.lift[i],
      route: b.routeName, produktionszeitWT: b.produktionszeitWT,
      produktionszeitWTMax, routenSeiten, aufschlaege,
    });
  });
  return zeilen;
}

// Eine Preiszeile (Inhaltspapier × Auflage, ohne Umschlag) exakt mit den
// Engine-Preisen der Staffel — ohne Hülle, weil die Hülle die Nachbarstaffeln
// braucht (computeInhaltZeilen). Dient Tests und Einzelabfragen.
export function computeInhaltZeile({ config, formatKey, farbigkeit, pInhaltId, auflage, seitenListe = SEITEN_STUETZSTELLEN }) {
  return computeInhaltZeilen({ config, formatKey, farbigkeit, pInhaltId, auflagen: [auflage], seitenListe, huelle: false })[0] ?? null;
}

// Preiszeilen für ein Inhaltspapier × Umschlagpapier × ALLE Auflagenstaffeln
// (mit Umschlag). Zusätzlich zu den Seiten-Aufschlägen: Farbigkeit-Umschlag-
// Delta (1/1 → 4/4) und Veredelung-Aufschläge (nur wenn die Umschlagpapier-
// Familie Cello erlaubt). Die Zellen sind additiv:
//   Gesamt = Basis + Seitenaufschlag + Umschlag-4/4 + Cello.
// Beim *Kombinieren* mehrerer Optionen ist die Summe eine Näherung (Preisbasis
// 2.4.0, 110.040 Kombinationen gemessen):
// (a) der Makulatursatz hängt am Gesamtvolumen (2.3.0) → Abweichungen im Cent- bis
//     niedrigen Euro-Bereich;
// (b) die Umschlag-Farbigkeit kann seit dem Dickenaufschlag (2.4.0) die Empfehlung
//     kippen (GC mit Aufschlag ↔ Partner) → in solchen Eckfällen bis 20 € / 7,5 %,
//     begrenzt durch die Empfehlungs-Toleranzen (preferInternDelta/preferKoppDelta).
// In keinem gemessenen Fall liegt die Summe UNTER dem echten Preis — die Abweichung
// geht immer zugunsten des Betriebs (siehe Test).
// Kassen-Anker (2.6.0, 1–10 Ex.): Der Preis ist dort linear in Kassenpreis und
// Normalpreis bei 10 Ex.; die Summe der Einzelaufschläge bleibt exakt (150.468
// Umschlag-Kombinationen bei 1–10 Ex. gemessen, Abweichung 0).
// Mit Hülle werden alle Kurven (Seiten × 1/1 × ohne Cello, dazu 4/4 und je
// Cello-Art) gehüllt; der 4/4- bzw. Cello-Aufschlag an der Staffel ist je nach
// aufschlagVariante das Maximum der Differenz über alle Seitenzahlen oder die
// Differenz an der Basis-Seitenzahl (siehe AUFSCHLAG_VARIANTEN).
export function computeUmschlagZeilen({
  config, formatKey, farbigkeit, pInhaltId, pUmschlagId, auflagen,
  seitenListe = SEITEN_STUETZSTELLEN, huelle = true, aufschlagVariante = AUFSCHLAG_VARIANTE_STANDARD,
}) {
  if (!auflagen?.length) return [];
  if (!AUFSCHLAG_VARIANTEN.includes(aufschlagVariante)) throw new Error(`Unbekannte aufschlagVariante „${aufschlagVariante}".`);
  const basisSeiten = seitenListe[0];
  const gemeinsam = {
    formatKey, pInhaltId, dInhaltKey: farbigkeit,
    hasUmschlag: true, pUmschlagId, produktionszeit: 'standard',
  };
  const kurve = kurvenCache({ config, gemeinsam, auflagen, huelle });
  const einfarbig = (seiten) => kurve({ seiten, dUmschlagKey: '1c', celloUmschlag: 'ohne' });
  const basis = einfarbig(basisSeiten);
  const seitenKurven = seitenListe.slice(1).map((seiten) => [seiten, einfarbig(seiten)]);

  const coverPaper = paperById(config, pUmschlagId);
  const celloErlaubt = Boolean(coverPaper && config.cello.erlaubteFamilien.includes(coverPaper.familie));
  const celloArten = celloErlaubt ? config.cello.arten.filter((art) => art.key !== 'ohne') : [];

  // Zusatzoptionen (4/4, Cello) je Seitenzahl: bei alleSeiten alle Stützstellen,
  // bei basisSeiten nur die erste.
  const seitenFuerAufschlag = aufschlagVariante === 'alleSeiten' ? seitenListe : [basisSeiten];
  const zusatz = (overrides) => seitenFuerAufschlag.map((seiten) => [seiten, kurve({ seiten, dUmschlagKey: '1c', celloUmschlag: 'ohne', ...overrides })]);
  const farbigKurven = zusatz({ dUmschlagKey: '4c' });
  const celloKurven = celloArten.map((art) => [art.key, zusatz({ celloUmschlag: art.key })]);

  // Aufschlag einer Zusatzoption an Staffel i: Maximum über die Seitenzahlen der
  // Differenz (Zusatz − 1/1 ohne Cello), nur wo beide bepreist sind. null, wenn
  // die Option an der Basis-Seitenzahl nicht kalkulierbar ist (Zelle bleibt leer).
  const zusatzAufschlag = (kurven, i) => {
    const anBasis = kurven[0][1];
    if (anBasis.werte[i] == null) return null;
    let max = null;
    for (const [seiten, k] of kurven) {
      const ref = seiten === basisSeiten ? basis : einfarbig(seiten);
      if (k.werte[i] == null || ref.werte[i] == null) continue;
      const d = k.werte[i] - ref.werte[i];
      if (max == null || d > max) max = d;
    }
    return max == null ? null : Math.max(0, max);
  };

  const zeilen = [];
  auflagen.forEach((auflage, i) => {
    const b = basis.anStaffel.get(auflage);
    if (!b || basis.werte[i] == null) return;

    const aufschlaegeSeiten = {};
    const routenSeiten = { [basisSeiten]: b.routeName };
    let produktionszeitWTMax = b.produktionszeitWT;
    for (const [seiten, k] of seitenKurven) {
      const p = k.anStaffel.get(auflage);
      aufschlaegeSeiten[seiten] = aufschlag(k.werte[i], basis.werte[i]);
      routenSeiten[seiten] = p ? p.routeName : null;
      if (p && p.produktionszeitWT > produktionszeitWTMax) produktionszeitWTMax = p.produktionszeitWT;
    }

    // Zeilenmaximum der Produktionszeit wie bisher über die Basiszellen der
    // Zusatzoptionen (4/4 und je Cello-Art an der Basis-Seitenzahl, N13): Der
    // eine Liefertermin der Zeile muss jede wählbare Zelle abdecken. Gemessen
    // über 7.720 mit-U-Zeilen bisher 0 Fälle, in denen Cello die Route kippt —
    // die Invariante soll aber nicht vom Zufall der aktuellen Preise abhängen.
    const farbigBasis = farbigKurven[0][1].anStaffel.get(auflage);
    if (farbigBasis && farbigBasis.produktionszeitWT > produktionszeitWTMax) produktionszeitWTMax = farbigBasis.produktionszeitWT;
    const aufschlagFarbigkeitUmschlag = zusatzAufschlag(farbigKurven, i);

    const aufschlaegeVeredelung = {};
    if (celloErlaubt) {
      aufschlaegeVeredelung.ohne = 0;
      for (const [artKey, kurven] of celloKurven) {
        aufschlaegeVeredelung[artKey] = zusatzAufschlag(kurven, i);
        const p = kurven[0][1].anStaffel.get(auflage);
        if (p && p.produktionszeitWT > produktionszeitWTMax) produktionszeitWTMax = p.produktionszeitWT;
      }
    }

    zeilen.push({
      pInhaltId, pUmschlagId, auflage, basisSeiten, basisPreis: basis.werte[i], liftBasis: basis.lift[i],
      route: b.routeName, produktionszeitWT: b.produktionszeitWT,
      produktionszeitWTMax, routenSeiten,
      aufschlaegeSeiten, aufschlagFarbigkeitUmschlag,
      veredelungMoeglich: celloErlaubt, aufschlaegeVeredelung,
    });
  });
  return zeilen;
}

// Eine Preiszeile (Inhalt × Umschlag × Auflage) exakt mit den Engine-Preisen der
// Staffel, 4/4- und Cello-Aufschlag an der Basis-Seitenzahl — ohne Hülle
// (Stand vor dem 31.10.2026). Dient Tests und Einzelabfragen.
export function computeUmschlagZeile({ config, formatKey, farbigkeit, pInhaltId, pUmschlagId, auflage, seitenListe = SEITEN_STUETZSTELLEN }) {
  return computeUmschlagZeilen({
    config, formatKey, farbigkeit, pInhaltId, pUmschlagId, auflagen: [auflage], seitenListe,
    huelle: false, aufschlagVariante: 'basisSeiten',
  })[0] ?? null;
}

// Vollständige Preismatrix für einen ohne-Umschlag-Artikel: alle zulässigen
// Inhaltspapiere des Formats × alle Auflagenstaffeln (mit Hülle, sofern nicht
// abgeschaltet).
export function computeArtikelOhneUmschlag({ config, formatKey, farbigkeit, auflagen, seitenListe, huelle = true }) {
  const format = formatByKey(config, formatKey);
  if (!format) return [];
  const zeilen = [];
  for (const pInhaltId of format.papiereInhalt) {
    zeilen.push(...computeInhaltZeilen({ config, formatKey, farbigkeit, pInhaltId, auflagen, seitenListe, huelle }));
  }
  return zeilen;
}

// Vollständige Preismatrix für einen mit-Umschlag-Artikel: alle zulässigen
// Inhaltspapier×Umschlagpapier-Kombinationen × Auflagenstaffeln. Welche Umschläge
// zulässig sind (Familienregel + umschlagAusnahmen), entscheidet ausschließlich
// getCoverPaperOptions — dieselbe Quelle wie Rechner-Dropdown und Engine.
export function computeArtikelMitUmschlag({ config, formatKey, farbigkeit, auflagen, seitenListe, huelle = true, aufschlagVariante }) {
  const format = formatByKey(config, formatKey);
  if (!format) return [];
  const zeilen = [];
  for (const pInhaltId of format.papiereInhalt) {
    const coverIds = getCoverPaperOptions(config, formatKey, pInhaltId).map((p) => p.id);
    for (const pUmschlagId of coverIds) {
      zeilen.push(...computeUmschlagZeilen({ config, formatKey, farbigkeit, pInhaltId, pUmschlagId, auflagen, seitenListe, huelle, aufschlagVariante }));
    }
  }
  return zeilen;
}
