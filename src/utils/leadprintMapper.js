import { calculateRSTPrice } from './calculateRSTPrice';

// Seitenzahlen, die als Listenwerte im Optionsfeld "Seitenanzahl Innenteil" (5628)
// angelegt sind (siehe leadprintMapping.rst.json → optionsfelder).
export const SEITEN_STUETZSTELLEN = Array.from({ length: 29 }, (_, i) => 8 + i * 4);

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

// Preiszeile für ein Inhaltspapier × Auflage (ohne Umschlag): Basispreis bei der
// kleinsten Seitenzahl + additive Aufschläge je weiterer Seitenzahl-Stützstelle.
// Die additive Verrechnung ist exakt, keine Näherung: jeder Aufschlag ist die
// Differenz zweier vollständig gerechneter Preise — auch über einen Routenwechsel
// hinweg (zellgenau gegen RST-Rechner-Export.md verifiziert).
// Stützstellen ohne mögliche Route liefern bewusst `null`; im Shop müssen daraus
// LEERE Zellen werden (Leadprint blendet Optionen ohne Preis aus), niemals 0.
export function computeInhaltZeile({ config, formatKey, farbigkeit, pInhaltId, auflage, seitenListe = SEITEN_STUETZSTELLEN }) {
  const basisSeiten = seitenListe[0];
  const basis = preis(config, {
    formatKey, auflage, seiten: basisSeiten, pInhaltId, dInhaltKey: farbigkeit,
    hasUmschlag: false, pUmschlagId: '', dUmschlagKey: farbigkeit, celloUmschlag: 'ohne', produktionszeit: 'standard',
  });
  if (!basis) return null;

  const aufschlaege = {};
  for (const seiten of seitenListe.slice(1)) {
    const p = preis(config, {
      formatKey, auflage, seiten, pInhaltId, dInhaltKey: farbigkeit,
      hasUmschlag: false, pUmschlagId: '', dUmschlagKey: farbigkeit, celloUmschlag: 'ohne', produktionszeit: 'standard',
    });
    aufschlaege[seiten] = p ? p.gesamt - basis.gesamt : null;
  }

  return { pInhaltId, auflage, basisSeiten, basisPreis: basis.gesamt, route: basis.routeName, produktionszeitWT: basis.produktionszeitWT, aufschlaege };
}

// Preiszeile für ein Inhaltspapier × Umschlagpapier × Auflage (mit Umschlag).
// Zusätzlich zu den Seiten-Aufschlägen: Farbigkeit-Umschlag-Delta (1/1 → 4/4) und
// Veredelung-Aufschläge (nur wenn die Umschlagpapier-Familie Cello erlaubt).
export function computeUmschlagZeile({ config, formatKey, farbigkeit, pInhaltId, pUmschlagId, auflage, seitenListe = SEITEN_STUETZSTELLEN }) {
  const basisSeiten = seitenListe[0];
  const gemeinsam = {
    formatKey, auflage, pInhaltId, dInhaltKey: farbigkeit,
    hasUmschlag: true, pUmschlagId, dUmschlagKey: '1c', celloUmschlag: 'ohne', produktionszeit: 'standard',
  };

  const basis = preis(config, { ...gemeinsam, seiten: basisSeiten });
  if (!basis) return null;

  const aufschlaegeSeiten = {};
  for (const seiten of seitenListe.slice(1)) {
    const p = preis(config, { ...gemeinsam, seiten });
    aufschlaegeSeiten[seiten] = p ? p.gesamt - basis.gesamt : null;
  }

  const farbig = preis(config, { ...gemeinsam, seiten: basisSeiten, dUmschlagKey: '4c' });
  const aufschlagFarbigkeitUmschlag = farbig ? farbig.gesamt - basis.gesamt : null;

  const coverPaper = paperById(config, pUmschlagId);
  const celloErlaubt = coverPaper && config.cello.erlaubteFamilien.includes(coverPaper.familie);
  const aufschlaegeVeredelung = {};
  if (celloErlaubt) {
    for (const art of config.cello.arten) {
      if (art.key === 'ohne') { aufschlaegeVeredelung[art.key] = 0; continue; }
      const p = preis(config, { ...gemeinsam, seiten: basisSeiten, celloUmschlag: art.key });
      aufschlaegeVeredelung[art.key] = p ? p.gesamt - basis.gesamt : null;
    }
  }

  return {
    pInhaltId, pUmschlagId, auflage, basisSeiten, basisPreis: basis.gesamt,
    route: basis.routeName, produktionszeitWT: basis.produktionszeitWT,
    aufschlaegeSeiten, aufschlagFarbigkeitUmschlag,
    veredelungMoeglich: celloErlaubt, aufschlaegeVeredelung,
  };
}

// Vollständige Preismatrix für einen ohne-Umschlag-Artikel: alle zulässigen
// Inhaltspapiere des Formats × alle Auflagenstaffeln.
export function computeArtikelOhneUmschlag({ config, formatKey, farbigkeit, auflagen, seitenListe }) {
  const format = formatByKey(config, formatKey);
  if (!format) return [];
  const zeilen = [];
  for (const pInhaltId of format.papiereInhalt) {
    for (const auflage of auflagen) {
      const zeile = computeInhaltZeile({ config, formatKey, farbigkeit, pInhaltId, auflage, seitenListe });
      if (zeile) zeilen.push(zeile);
    }
  }
  return zeilen;
}

// Vollständige Preismatrix für einen mit-Umschlag-Artikel: alle zulässigen
// Inhaltspapier×Umschlagpapier-Kombinationen (Familienregel!) × Auflagenstaffeln.
export function computeArtikelMitUmschlag({ config, formatKey, farbigkeit, auflagen, seitenListe }) {
  const format = formatByKey(config, formatKey);
  if (!format) return [];
  const zeilen = [];
  for (const pInhaltId of format.papiereInhalt) {
    const contentPaper = paperById(config, pInhaltId);
    const coverIds = format.papiereUmschlag.filter((id) => paperById(config, id)?.familie === contentPaper.familie);
    for (const pUmschlagId of coverIds) {
      for (const auflage of auflagen) {
        const zeile = computeUmschlagZeile({ config, formatKey, farbigkeit, pInhaltId, pUmschlagId, auflage, seitenListe });
        if (zeile) zeilen.push(zeile);
      }
    }
  }
  return zeilen;
}
