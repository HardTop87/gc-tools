// Import-Builder: macht aus einer Leadprint-Export-Datei (Vorlage) und der
// Preisberechnung die fertige Import-Datei für EINEN Artikel.
//
// Arbeitsteilung (Konzept Kap. 3 + Entscheidungen 10.10.2026):
//   leadprintExportFile  – liest/schreibt die Blockstruktur verlustfrei
//   leadprintWriter      – rechnet die Preiszeilen (Sorte × Auflage) mit
//                          Aufschlägen je Listenwert, Routen-Tag, Liefertagen
//   dieses Modul         – verdrahtet die Zeilen in die Spalten der Vorlage,
//                          setzt Weiterleitungen (rai) und Sorten-Flags und
//                          prüft die Artikel-Einstellungen der Vorlage
//
// Was aus der Vorlage unverändert übernommen wird: article-Block (Armin pflegt
// Bezeichnung, Artikelnummer, PayPal-Aufschlag, Produktionszeit im Backend),
// die Feld-Flags der dynopt-Blöcke (werden nur geprüft, nicht gesetzt) und
// alle Nicht-Preis-Spalten der Referenz-Preiszeile (z. B. Pakete, Gewicht).
//
// Was neu geschrieben wird: articleGlobalVariety (Sorten-Flags aus der Config)
// und der komplette articlePrices-Block. Leere Zellen bleiben leer — nie 0.
//
// Staffelzeilen und ihre IDs (31.10.2026, Raster B mit 151 Staffeln): Ist die
// Vorlage der Export DIESES Artikels (article.id = leadprintId), werden die
// Vorlagenzeilen über (Sorte paper__id, Auflage wert) wiedergefunden und ihre
// articlePrices.id übernommen → der Import aktualisiert die Staffel statt sie
// zu löschen und neu anzulegen. Zeilen, die es in der Vorlage nicht gibt
// (neue Staffeln, neue Sorten), bekommen eine LEERE id (Doku: „Wenn diese
// Zelle leer ist, wird ein neuer Staffeleintrag angelegt"). Vorlagenzeilen,
// deren Sorte im Artikel nicht mehr aktiv ist, kommen nicht in die Datei —
// der Import löscht sie (Doku: Staffeln, die in der Datei fehlen, werden
// entfernt). Bei fremder Vorlage (Neuanlage, Testartikel Stufe 2) gehören die
// IDs einem anderen Artikel → alle Zeilen ohne id. Zeilenreihenfolge wie die
// Vorlage (Sorte in der Reihenfolge ihres Auftretens, neue Sorten hinten in
// Config-Reihenfolge; je Sorte Auflage aufsteigend), sortiercode 10, 20, …
//
// Sicherheitshülle: Die Preise kommen aus dem Writer mit Hülle (Befund 1);
// `huelle: false` baut die Datei mit rohen Engine-Preisen (Vergleich, Tests).
//
// Zwei Artikeltypen (Umschlagartikel-Plan.md, 31.10.2026):
//   ohne Umschlag   – Zeile = Inhaltspapier × Auflage, Basis 8 Seiten; die
//                     Umschlag-Felder bleiben leer, „4 Seiten" (5563/16136)
//                     springt in den Umschlagartikel mit dem Standard-Umschlag
//                     der Papierfamilie (mapping.standardUmschlag), solange es
//                     den nicht gibt, in den alten mit-U-Zwilling.
//   Umschlagartikel – umschlag „mit" + umschlagPapier: Zeile = Inhaltspapier ×
//                     Auflage (nur Papiere, zu denen der Umschlag passt), Basis
//                     4 Seiten / Umschlag 1/1 / ohne Cello; Farbigkeit und
//                     Veredelung des Umschlags sind Aufschläge; „Papier
//                     Umschlag" (5555) sind Weiterleitungen auf die
//                     Geschwister-Artikel mit anderem Umschlag.
//
// Neuanlage in zwei Stufen: Hat der Artikel im Mapping keine leadprintId, wird
// die Vorlage eines fremden Artikels benutzt, article.id bleibt LEER (Doku:
// „Ist diese Zelle leer, wird ein neuer Artikel angelegt") und alle
// Weiterleitungen auf Artikel ohne ID bleiben leer. Sobald die IDs nach dem
// ersten Export im Mapping stehen, erzeugt derselbe Build die Update-Datei mit
// gesetzter ID und allen Weiterleitungen — ohne Codeänderung.

import {
  blockToObjects,
  findBlock,
  objectsToBlockRows,
  parseLeadprintExport,
  serializeLeadprintExport,
} from './leadprintExportFile';
import { getCoverPaperOptions } from './calculateRSTPrice';
import {
  buildPreiszeilenMitUmschlag,
  buildPreiszeilenOhneUmschlag,
  inhaltspapiereZuUmschlag,
  mappingHinweise,
  pruefeMappingVollstaendigkeit,
} from './leadprintWriter';

// Zielzustand der Feld-Flags je Artikel (Checkliste A4). SquareFold (5629)
// darf aus sein — es ist ohnehin unbepreist.
export const ZIEL_FELDER_AN = [12913, 5561, 5628, 5559, 5560, 5563, 5556, 5555, 5562, 13453];
export const ZIEL_FELDER_AUS = [5470, 5510, 5516];
export const FELD_PRODUKTIONSGESCHWINDIGKEIT = 13453;

// Liefertermin je Preiszeile ist in Leadprint ein Offset auf „Versandfertig in"
// (article.produktionszeit), Auswahlliste 0–10 Tage (Doku article_eximport).
const LIEFERTAGE_OFFSET_MAX = 10;

// Artikel-Felder, die bei einer Neuanlage (oder einem Update mit fremder
// Vorlage) nicht aus der Vorlage stammen dürfen. cdate/mdate kennt die Doku
// nicht als Importfeld → leer lassen, der Shop setzt sie selbst.
const NEUANLAGE_FELDER = {
  bezeichnung_url: null,
  status: 'OK', // GESPERRT wäre im Frontend nicht erreichbar, also nicht testbar
  global_in_allen_subhops_ausblenden_jn: 1,
  glob_artikel_rabatt: 3,
  cdate: null,
  mdate: null,
};

function rundeCent(wert) {
  return Math.round(wert * 100) / 100;
}

// Basis und Zellpreis werden getrennt gerundet, damit Basis + Aufschlag genau
// dem gerundeten Engine-Preis der Zelle entspricht (auf den Cent exakt).
function centAufschlag(basis, aufschlag) {
  if (aufschlag == null) return null;
  return rundeCent(basis + aufschlag) - rundeCent(basis);
}

function gruppenIndex(mapping) {
  // gruppenId → { name, feld } für alle Optionsfelder mit Gruppen-ID
  const index = new Map();
  for (const [name, feld] of Object.entries(mapping.optionsfelder ?? {})) {
    if (feld.gruppenId) index.set(String(feld.gruppenId), { name, feld });
  }
  return index;
}

function listenwertSchluessel(feld, listenwertId) {
  // werte: { schluessel: id } → Schlüssel zum Listenwert (z. B. "A5_Hoch", "4c", "24")
  for (const [schluessel, id] of Object.entries(feld.werte ?? {})) {
    if (String(id) === String(listenwertId)) return schluessel;
  }
  return null;
}

// Umschlagpapier-Key zu einem Listenwert der Gruppe 5555 (mapping.umschlagListenwerte)
function umschlagPapierZuListenwert(mapping, listenwertId) {
  for (const [papierId, eintrag] of Object.entries(mapping.umschlagListenwerte ?? {})) {
    if (String(eintrag.listenwertId) === String(listenwertId)) return papierId;
  }
  return null;
}

function papierFamilie(config, papierId) {
  return config.papiere.find((p) => p.id === papierId)?.familie ?? null;
}

function istUmschlagartikel(artikel) {
  return artikel.umschlag === 'mit' && Boolean(artikel.umschlagPapier);
}

// Artikel im Mapping, der genau zu `ziel` passt: Format, Farbigkeit, Umschlag,
// Umschlagpapier (null = alter mit-U-Artikel ohne festes Papier) und Rolle.
// Testartikel verweisen nur auf Testartikel, Live-Artikel nur auf Live-Artikel.
function findeArtikel(mapping, ziel) {
  return (mapping.artikel ?? []).find(
    (a) => a.format === ziel.format
      && a.farbigkeit === ziel.farbigkeit
      && a.umschlag === ziel.umschlag
      && (a.umschlagPapier ?? null) === (ziel.umschlagPapier ?? null)
      && (a.rolle ?? null) === (ziel.rolle ?? null),
  ) ?? null;
}

// Weiterleitung auf einen Zwillingsartikel: Rückgabe { wert: 0, rai: <leadprintId> }
// oder die leere Zelle, wenn es den Zwilling nicht gibt. Ein Zwilling OHNE
// leadprintId wird nicht still zur Leerzelle, sondern einmal je Ziel gemeldet:
//   Live-Artikel → Warnung (Tippfehler, Artikel nicht angelegt — M9, Bug-Hunt V5),
//   Testartikel  → Hinweis (Stufe 1: die ID gibt es erst nach dem ersten Export).
function weiterleitungAuf({ zwilling, name, schluessel, bericht }) {
  const leer = { wert: null, rai: null };
  if (!zwilling) return leer;
  if (!zwilling.leadprintId) {
    if (zwilling.rolle === 'test') {
      const meldung = `Weiterleitung ${name}/${schluessel} → ${zwilling.key}: Testartikel ohne ID, Zelle bleibt bis Stufe 2 leer.`;
      if (!bericht.hinweise.includes(meldung)) bericht.hinweise.push(meldung);
    } else {
      const meldung = `Weiterleitung ${name}/${schluessel}: Zwilling ${zwilling.key} hat keine leadprintId — Option bleibt leer.`;
      if (!bericht.warnungen.includes(meldung)) bericht.warnungen.push(meldung);
    }
    return leer;
  }
  return { wert: 0, rai: zwilling.leadprintId };
}

// Zwilling = gleicher Artikel bis auf die Dimensionen in `aenderung`.
function weiterleitung({ mapping, artikel, aenderung, name, schluessel, bericht }) {
  const ziel = {
    format: artikel.format, farbigkeit: artikel.farbigkeit, umschlag: artikel.umschlag,
    umschlagPapier: artikel.umschlagPapier ?? null, rolle: artikel.rolle ?? null,
    ...aenderung,
  };
  return weiterleitungAuf({ zwilling: findeArtikel(mapping, ziel), name, schluessel, bericht });
}

// Sprung „mit Umschlag" aus einem ohne-U-Artikel, je Zeile: Ziel ist der
// Umschlagartikel mit dem Standard-Umschlag der Papierfamilie des Inhalts-
// papiers (mapping.standardUmschlag). Gibt es den (noch) nicht, bleibt es beim
// alten mit-U-Zwilling ohne festes Umschlagpapier — so ändert sich für die
// Live-Artikel nichts, bis die Umschlagartikel angelegt sind.
function sprungMitUmschlag({ config, mapping, artikel, zeile, name, bericht }) {
  const basis = { format: artikel.format, farbigkeit: artikel.farbigkeit, umschlag: 'mit', rolle: artikel.rolle ?? null };
  const familie = papierFamilie(config, zeile.papierId);
  const standard = familie ? mapping.standardUmschlag?.[familie] ?? null : null;
  const umschlagartikel = standard ? findeArtikel(mapping, { ...basis, umschlagPapier: standard }) : null;
  if (umschlagartikel) return weiterleitungAuf({ zwilling: umschlagartikel, name, schluessel: `mit (${familie} → ${standard})`, bericht });
  return weiterleitungAuf({ zwilling: findeArtikel(mapping, { ...basis, umschlagPapier: null }), name, schluessel: 'mit', bericht });
}

// Prüft die Vorlage gegen den Zielzustand (Checkliste) und liefert die
// Basis-Produktionszeit des Artikels. Fehler = Import nicht sinnvoll;
// Warnungen = Import läuft, Armin sollte es aber im Backend ansehen.
// Setzt bericht.neuanlage / bericht.vorlageFremd (siehe Kopfkommentar).
function pruefeVorlage(model, artikel, bericht) {
  const articleBlock = findBlock(model, 'article.');
  if (!articleBlock || !articleBlock.rows.length) {
    bericht.fehler.push('Vorlage ohne article-Block.');
    return null;
  }
  const art = blockToObjects(articleBlock)[0];
  bericht.neuanlage = !artikel.leadprintId;
  bericht.vorlageFremd = String(art.id) !== String(artikel.leadprintId);
  if (bericht.vorlageFremd) {
    if (bericht.neuanlage) {
      bericht.hinweise.push(`Neuanlage: article.id bleibt leer, Artikel-Einstellungen kommen aus der Vorlage ${art.id} (${art.artikelnummer}).`);
    } else if (artikel.rolle === 'test') {
      bericht.warnungen.push(`Vorlage gehört zu Artikel ${art.id}, article.id wird auf ${artikel.leadprintId} gesetzt (Testartikel, Stufe 2 mit fremder Vorlage).`);
    } else {
      bericht.fehler.push(`Vorlage gehört zu Artikel ${art.id}, erwartet ${artikel.leadprintId} (${artikel.key}).`);
    }
  }
  const basisWT = Number(art.produktionszeit);
  if (!Number.isFinite(basisWT)) {
    bericht.fehler.push('article.produktionszeit fehlt oder ist keine Zahl (Basis der Liefertage).');
  }
  if (Number(art.glob_artikel_rabatt) !== 3 && !bericht.vorlageFremd) {
    bericht.warnungen.push(`Preismanipulation steht auf ${art.glob_artikel_rabatt} %, Ziel sind 3 % (PayPal).`);
  }

  const flags = new Map();
  for (const block of model.blocks) {
    const kopf = String(block.header[0] ?? '');
    if (!kopf.startsWith('article_dynopt_')) continue;
    const gruppe = kopf.split('.')[1];
    const werte = {};
    block.header.forEach((h, i) => {
      const rest = String(h).split('.').slice(2).join('.');
      werte[rest || 'an'] = block.rows[0]?.[i];
    });
    flags.set(String(gruppe), werte);
  }
  for (const gruppe of ZIEL_FELDER_AN) {
    const f = flags.get(String(gruppe));
    if (!f) bericht.warnungen.push(`Feld ${gruppe} kommt in der Vorlage nicht vor.`);
    else if (Number(f.an) !== 1) bericht.warnungen.push(`Feld ${gruppe} ist am Artikel nicht aktiv.`);
  }
  for (const gruppe of ZIEL_FELDER_AUS) {
    const f = flags.get(String(gruppe));
    if (f && Number(f.an) === 1) bericht.warnungen.push(`Altes Feld ${gruppe} ist am Artikel noch aktiv.`);
  }
  const pg = flags.get(String(FELD_PRODUKTIONSGESCHWINDIGKEIT));
  if (pg && Number(pg.pt) !== 1) {
    bericht.warnungen.push('Produktionsgeschwindigkeit (13453): Preistyp ist nicht Prozent (pt ≠ 1) — Express wäre ein Euro-Betrag.');
  }
  return Number.isFinite(basisWT) ? basisWT : null;
}

// Artikel-Felder, die das Mapping vorgibt (Entscheidung Armin 11.10.2026):
// Bezeichnung mit „ohne/mit Umschlag", Artikelnummer, und die Sichtbarkeit in
// der Warengruppenliste — nur Einstiegsartikel (4/4 ohne Umschlag je Format)
// sind sichtbar, alle anderen erreicht der Kunde über die Weiterleitungen.
// Bei Neuanlage / fremder Vorlage zusätzlich: article.id (leer bzw. eigene ID)
// und die NEUANLAGE_FELDER, weil die Werte der Vorlage einem anderen Artikel
// gehören.
function schreibeArtikelFelder(model, artikel, bericht) {
  const block = findBlock(model, 'article.');
  if (!block || !block.rows.length) return;
  const setze = (feld, wert) => {
    const i = block.header.findIndex((h) => String(h) === `article.${feld}`);
    if (i < 0) { bericht.warnungen.push(`Vorlage ohne Spalte article.${feld} — bleibt wie im Backend.`); return; }
    if (String(block.rows[0][i] ?? '') !== String(wert ?? '')) bericht.geaendert.push(`${feld}: „${block.rows[0][i] ?? ''}" → „${wert ?? ''}"`);
    block.rows[0][i] = wert;
  };
  if (bericht.vorlageFremd) {
    setze('id', artikel.leadprintId ?? null);
    for (const [feld, wert] of Object.entries(NEUANLAGE_FELDER)) setze(feld, wert);
  }
  if (artikel.bezeichnung) setze('bezeichnung', artikel.bezeichnung);
  if (artikel.artikelnummer) setze('artikelnummer', artikel.artikelnummer);
  setze('unsichtbar', artikel.einstieg ? 0 : 1);
}

// Inhaltspapiere, die der Artikel im Shop anbietet: ohne Umschlag alle des
// Formats, als Umschlagartikel nur die, zu denen das Umschlagpapier passt.
function inhaltspapiereDesArtikels(config, artikel) {
  if (istUmschlagartikel(artikel)) return inhaltspapiereZuUmschlag(config, artikel.format, artikel.umschlagPapier);
  return config.formate.find((f) => f.key === artikel.format)?.papiereInhalt ?? [];
}

// Sorten-Flags: genau die Inhaltspapiere des Artikels (laut Config) an, alles
// andere aus. Sorten ohne Spalte in der Vorlage können nicht geschaltet werden.
function schreibeSortenFlags(model, config, mapping, artikel, bericht) {
  const block = findBlock(model, 'articleGlobalVariety');
  if (!block) {
    bericht.warnungen.push('Vorlage ohne articleGlobalVariety-Block — Sorten-Flags bleiben wie im Backend.');
    return;
  }
  const gewollt = new Map();
  for (const papierId of inhaltspapiereDesArtikels(config, artikel)) {
    const sortenId = mapping.sorten?.[papierId]?.sortenId;
    if (sortenId) gewollt.set(String(sortenId), papierId);
  }
  const vorhanden = new Set();
  const zeile = block.header.map((h) => {
    const sortenId = String(h).split('.')[1];
    vorhanden.add(sortenId);
    const an = gewollt.has(sortenId);
    (an ? bericht.sortenAn : bericht.sortenAus).push(an ? gewollt.get(sortenId) : sortenId);
    return an ? 1 : 0;
  });
  for (const [sortenId, papierId] of gewollt) {
    if (!vorhanden.has(sortenId)) bericht.fehler.push(`Sorte ${papierId} (${sortenId}) hat keine Spalte im articleGlobalVariety-Block.`);
  }
  block.rows = [zeile];
}

// Wert einer dynopt-Spalte für eine Preiszeile eines ohne-Umschlag-Artikels.
// Rückgabe: { wert, rai } — beides null = Zelle leer (Option ausgeblendet).
function dynoptZelleOhneUmschlag({ listenwertId, istBp, istRai, feldInfo, zeile, artikel, config, mapping, bericht }) {
  const leer = { wert: null, rai: null };
  if (!feldInfo) return leer; // unbekannte Gruppe → leer, wird im Bericht gemeldet
  const { name, feld } = feldInfo;
  const springe = (aenderung, schluessel) => weiterleitung({ mapping, artikel, aenderung, name, schluessel, bericht });
  switch (name) {
    case 'Seitenanzahl Innenteil': {
      if (istBp || istRai) return leer;
      const schluessel = listenwertSchluessel(feld, listenwertId);
      if (schluessel === '4') return leer; // P3: 4 Seiten nur mit Umschlag
      const aufschlag = zeile.aufschlaege[listenwertId];
      if (aufschlag == null) return leer;
      return { wert: centAufschlag(zeile.preis, aufschlag), rai: null };
    }
    case 'Endformat': {
      const formatKey = listenwertSchluessel(feld, listenwertId);
      if (formatKey === artikel.format) return { wert: 0, rai: null };
      return springe({ format: formatKey }, formatKey);
    }
    case 'Farbigkeit Innenteil': {
      const farbigkeit = listenwertSchluessel(feld, listenwertId);
      if (farbigkeit === artikel.farbigkeit) return { wert: 0, rai: null };
      return springe({ farbigkeit }, farbigkeit);
    }
    case 'Seitenanzahl Umschlag (RST)': {
      const schluessel = listenwertSchluessel(feld, listenwertId);
      if (schluessel === 'ohne') return { wert: 0, rai: null };
      if (schluessel === 'mit') return sprungMitUmschlag({ config, mapping, artikel, zeile, name, bericht });
      return leer;
    }
    // Statische Felder (eine Option, 0 €): Nur der Listenwert, den das Mapping
    // unter `werte` kennt (Bindung: Drahtheftung 2-fach; Papier Innenteil:
    // „siehe Sorte"), bekommt 0 — alle anderen Listenwerte der Gruppe bleiben
    // leer, sonst wären Klebebindung, Hardcover, Wire-O … im Shop zum RST-Preis
    // wählbar (M8, Bug-Hunt V5). Keine Weiterleitung → .rai immer leer.
    case 'Bindung':
    case 'Papier Innenteil':
      if (istBp || istRai) return leer;
      return listenwertSchluessel(feld, listenwertId) ? { wert: 0, rai: null } : leer;
    // Umschlag-Felder bleiben im ohne-U-Artikel komplett leer → unsichtbar;
    // SquareFold ist nicht im Rechner.
    case 'Farbigkeit Umschlag (RST)':
    case 'Papier Umschlag (RST)':
    case 'Veredelung Umschlag (RST)':
    case 'SquareFold':
    default:
      return leer;
  }
}

// Wert einer dynopt-Spalte für eine Preiszeile eines Umschlagartikels.
function dynoptZelleMitUmschlag({ listenwertId, istBp, istRai, feldInfo, zeile, artikel, config, mapping, bericht }) {
  const leer = { wert: null, rai: null };
  if (!feldInfo) return leer;
  const { name, feld } = feldInfo;
  const springe = (aenderung, schluessel) => weiterleitung({ mapping, artikel, aenderung, name, schluessel, bericht });
  switch (name) {
    // Basis der Zeile ist „4 Seiten" (P3: nur mit Umschlag) → 0, alle weiteren
    // Stützstellen als Aufschlag, nicht kalkulierbare bleiben leer.
    case 'Seitenanzahl Innenteil': {
      if (istBp || istRai) return leer;
      const aufschlag = zeile.aufschlaege[listenwertId];
      if (aufschlag == null) return leer;
      return { wert: centAufschlag(zeile.preis, aufschlag), rai: null };
    }
    // Umschlag 1/1 ist die Basis, 4/4 der Aufschlag aus der Engine.
    case 'Farbigkeit Umschlag (RST)': {
      if (istBp || istRai) return leer;
      const schluessel = listenwertSchluessel(feld, listenwertId);
      if (schluessel === '1c') return { wert: 0, rai: null };
      if (schluessel === '4c') return { wert: centAufschlag(zeile.preis, zeile.aufschlagFarbigkeitUmschlag), rai: null };
      return leer;
    }
    // Veredelung nur, wenn die Umschlag-Familie Cello erlaubt (CC/BD). Die
    // bp-Spalte („Basispreis" der Gruppe) steht in jeder Vorlagenzeile auf 0.
    case 'Veredelung Umschlag (RST)': {
      if (istRai) return leer;
      if (!zeile.veredelungMoeglich) return leer;
      if (istBp) return { wert: 0, rai: null };
      const schluessel = listenwertSchluessel(feld, listenwertId);
      if (!schluessel) return leer;
      if (schluessel === 'ohne') return { wert: 0, rai: null };
      return { wert: centAufschlag(zeile.preis, zeile.aufschlaegeVeredelung?.[schluessel]), rai: null };
    }
    // Eigenes Umschlagpapier 0 ohne Ziel; andere Umschlagpapiere springen in
    // den Geschwister-Artikel, wenn sie zum Inhaltspapier der Zeile passen
    // (Familienregel + Ausnahmen) UND es den Artikel im Mapping gibt.
    case 'Papier Umschlag (RST)': {
      if (istBp) return leer;
      const papierId = umschlagPapierZuListenwert(mapping, listenwertId);
      if (!papierId) return leer;
      if (papierId === artikel.umschlagPapier) return { wert: 0, rai: null };
      const passt = getCoverPaperOptions(config, artikel.format, zeile.papierId).some((p) => p.id === papierId);
      if (!passt) return leer;
      return springe({ umschlagPapier: papierId }, papierId);
    }
    // „4 Seiten" ist der eigene Zustand; „ohne Umschlag" springt zurück in
    // den ohne-U-Artikel gleicher Format/Farbigkeit.
    case 'Seitenanzahl Umschlag (RST)': {
      const schluessel = listenwertSchluessel(feld, listenwertId);
      if (schluessel === 'mit') return { wert: 0, rai: null };
      if (schluessel === 'ohne') return springe({ umschlag: 'ohne', umschlagPapier: null }, 'ohne');
      return leer;
    }
    // Format- und Druckwechsel: Artikel mit demselben Umschlagpapier.
    case 'Endformat': {
      const formatKey = listenwertSchluessel(feld, listenwertId);
      if (formatKey === artikel.format) return { wert: 0, rai: null };
      return springe({ format: formatKey }, formatKey);
    }
    case 'Farbigkeit Innenteil': {
      const farbigkeit = listenwertSchluessel(feld, listenwertId);
      if (farbigkeit === artikel.farbigkeit) return { wert: 0, rai: null };
      return springe({ farbigkeit }, farbigkeit);
    }
    case 'Bindung':
    case 'Papier Innenteil':
      if (istBp || istRai) return leer;
      return listenwertSchluessel(feld, listenwertId) ? { wert: 0, rai: null } : leer;
    case 'SquareFold':
    default:
      return leer;
  }
}

// Verteiler nach Artikeltyp. Jede Spalte (Wert wie .rai) rechnet ihre Zelle
// selbst und nimmt sich aus { wert, rai } das passende Feld.
function dynoptZelle(args) {
  return istUmschlagartikel(args.artikel) ? dynoptZelleMitUmschlag(args) : dynoptZelleOhneUmschlag(args);
}

// Reduziert das Modell auf die Blöcke, die der Import wirklich braucht:
// article (nur die id als Anker), articleGlobalVariety, articlePrices. Alles
// andere (Artikel-Einstellungen, Feld-Flags) bleibt dann im Backend, wie es
// ist. Ob Leadprint so eine Teildatei akzeptiert, klärt der Testimport (T4);
// wenn ja, braucht der laufende Betrieb keine Export-Vorlagen mehr.
export function reduziereAufPreisbloecke(model) {
  const article = findBlock(model, 'article.');
  const idIndex = article ? article.header.findIndex((h) => String(h) === 'article.id') : -1;
  const blocks = [];
  if (article && idIndex >= 0) {
    blocks.push({ prefix: 'article', header: ['article.id'], rows: article.rows.map((r) => [r[idIndex]]), gapBefore: 0 });
  }
  for (const prefix of ['articleGlobalVariety', 'articlePrices']) {
    const block = findBlock(model, prefix);
    if (block) blocks.push({ ...block, gapBefore: 1 });
  }
  return { blocks, trailingGap: 0 };
}

// Baut das Modell der Import-Datei für einen Artikel (ohne Umschlag oder
// Umschlagartikel). nurPreisbloecke: siehe reduziereAufPreisbloecke — nur für
// bestehende Artikel sinnvoll (eine Neuanlage braucht den ganzen article-Block).
export function buildImportModel({ templateMatrix, config, mapping, artikelKey, nurPreisbloecke = false, huelle = true, aufschlagVariante }) {
  const ergebnis = buildVollesModell({ templateMatrix, config, mapping, artikelKey, huelle, aufschlagVariante });
  if (nurPreisbloecke && ergebnis.bericht.neuanlage) {
    ergebnis.bericht.fehler.push('Minimaldatei nicht möglich: Neuanlage braucht den vollständigen article-Block.');
  }
  if (nurPreisbloecke && !ergebnis.bericht.fehler.length) {
    ergebnis.model = reduziereAufPreisbloecke(ergebnis.model);
    // Die Minimaldatei trägt nur article.id — Bezeichnung, Artikelnummer und
    // Sichtbarkeit bleiben im Backend, also meldet der Bericht sie auch nicht
    // als geändert (N12).
    ergebnis.bericht.geaendert = [];
  }
  return ergebnis;
}

function buildVollesModell({ templateMatrix, config, mapping, artikelKey, huelle = true, aufschlagVariante }) {
  const bericht = {
    artikelKey, fehler: [], warnungen: [], hinweise: [], geaendert: [], zeilen: 0, leereZellen: 0, zellen: 0,
    zeilenMitId: 0, zeilenNeu: 0, vorlagenzeilenEntfallen: 0, huelle,
    sortenAn: [], sortenAus: [], unbekannteGruppen: [], referenzzeile: null, neuanlage: false, vorlageFremd: false,
  };
  const model = parseLeadprintExport(templateMatrix);

  const artikel = (mapping.artikel ?? []).find((a) => a.key === artikelKey);
  if (!artikel) {
    bericht.fehler.push(`Artikel ${artikelKey} nicht im Mapping.`);
    return { model, bericht };
  }
  if (artikel.umschlag !== 'ohne' && !istUmschlagartikel(artikel)) {
    bericht.fehler.push('Der Import-Builder kann mit-Umschlag-Artikel nur mit festem Umschlagpapier (umschlagPapier im Mapping) — die alten mit-U-Artikel nicht.');
    return { model, bericht };
  }
  for (const p of pruefeMappingVollstaendigkeit(config, mapping)) bericht.warnungen.push(`Mapping: ${p}`);
  for (const h of mappingHinweise(mapping)) bericht.hinweise.push(`Mapping: ${h}`);

  const basisWT = pruefeVorlage(model, artikel, bericht);
  schreibeArtikelFelder(model, artikel, bericht);
  schreibeSortenFlags(model, config, mapping, artikel, bericht);

  const preisBlock = findBlock(model, 'articlePrices');
  if (!preisBlock) {
    bericht.fehler.push('Vorlage ohne articlePrices-Block.');
    return { model, bericht };
  }
  const writer = istUmschlagartikel(artikel)
    ? buildPreiszeilenMitUmschlag({ config, mapping, artikelKey, huelle, aufschlagVariante })
    : buildPreiszeilenOhneUmschlag({ config, mapping, artikelKey, huelle });
  const { zeilen, probleme } = writer;
  for (const p of probleme) bericht.fehler.push(`Writer: ${p}`);
  for (const h of writer.hinweise ?? []) bericht.hinweise.push(`Writer: ${h}`);
  if (bericht.fehler.length) return { model, bericht };

  // Referenzzeile: Nicht-Preis-Spalten (Pakete, Gewicht, …) werden von der
  // ersten vorhandenen Zeile übernommen — bevorzugt die 1-Stück-Zeile; für
  // Zeilen einer Sorte, die in der Vorlage vorkommt, von deren erster Zeile.
  const alt = blockToObjects(preisBlock);
  const referenz = alt.find((r) => Number(r.wert) === 1) ?? alt[0] ?? {};
  bericht.referenzzeile = referenz.id ?? null;
  const referenzJeSorte = new Map();
  for (const r of alt) {
    const sorte = String(r.paper__id ?? '');
    if (!referenzJeSorte.has(sorte) || (Number(r.wert) === 1 && Number(referenzJeSorte.get(sorte).wert) !== 1)) referenzJeSorte.set(sorte, r);
  }
  // Vorlagenzeilen nach (Sorte, Auflage): Quelle der articlePrices.id — nur
  // wenn die Vorlage der Export dieses Artikels ist (siehe Kopfkommentar).
  const idsUebernehmen = !bericht.vorlageFremd;
  const vorlageNachSchluessel = new Map();
  for (const r of alt) {
    const schluessel = `${r.paper__id}|${Number(r.wert)}`;
    if (vorlageNachSchluessel.has(schluessel)) {
      bericht.warnungen.push(`Vorlage hat die Staffel ${r.wert} für Sorte ${r.paper__id} doppelt (ids ${vorlageNachSchluessel.get(schluessel).id}, ${r.id}) — die zweite wird vom Import gelöscht.`);
      continue;
    }
    vorlageNachSchluessel.set(schluessel, r);
  }

  const felder = preisBlock.header.map((h) => {
    const s = String(h ?? '');
    return s.includes('.') ? s.slice(s.indexOf('.') + 1) : s;
  });
  const gruppen = gruppenIndex(mapping);
  const dynSpalten = felder
    .filter((f) => f.startsWith('dynopt_'))
    .map((f) => {
      const teile = f.split('.'); // dynopt_aa . gruppe . listenwert|bp . rai?
      const gruppe = teile[1];
      const istBp = teile[2] === 'bp';
      const istRai = teile[3] === 'rai';
      const feldInfo = gruppen.get(String(gruppe)) ?? null;
      if (!feldInfo && !bericht.unbekannteGruppen.includes(gruppe)) bericht.unbekannteGruppen.push(gruppe);
      return { feld: f, gruppe, listenwertId: istBp ? null : teile[2], istBp, istRai, feldInfo };
    });
  const seitenFeld = mapping.optionsfelder['Seitenanzahl Innenteil'];
  for (const [seiten, lwId] of Object.entries(seitenFeld.werte)) {
    if (seiten === '4' && !istUmschlagartikel(artikel)) continue;
    if (!dynSpalten.some((s) => s.gruppe === String(seitenFeld.gruppenId) && s.listenwertId === String(lwId))) {
      bericht.warnungen.push(`Vorlage hat keine Spalte für Seitenanzahl ${seiten} (Listenwert ${lwId}) — der Aufschlag kann nicht geschrieben werden.`);
    }
  }
  if (istUmschlagartikel(artikel)) {
    // Ohne diese Spalten wären Umschlag-Farbigkeit, Veredelung oder der
    // Umschlagwechsel im Shop stumm — die Vorlage muss ein mit-U-Export sein.
    for (const gruppenName of ['Farbigkeit Umschlag (RST)', 'Veredelung Umschlag (RST)', 'Papier Umschlag (RST)']) {
      const gruppenId = String(mapping.optionsfelder[gruppenName]?.gruppenId ?? '');
      if (!dynSpalten.some((s) => s.gruppe === gruppenId)) {
        bericht.fehler.push(`Vorlage hat keine Spalten der Gruppe ${gruppenId} (${gruppenName}) — für einen Umschlagartikel ungeeignet.`);
      }
    }
    const eigenerLw = mapping.umschlagListenwerte?.[artikel.umschlagPapier]?.listenwertId;
    if (!dynSpalten.some((s) => s.listenwertId === String(eigenerLw))) {
      bericht.fehler.push(`Vorlage hat keine Spalte für das eigene Umschlagpapier ${artikel.umschlagPapier} (Listenwert ${eigenerLw}).`);
    }
    if (bericht.fehler.length) return { model, bericht };
  }

  // Reihenfolge wie die Vorlage: Sorten in der Reihenfolge ihres Auftretens,
  // neue Sorten dahinter in Writer-Reihenfolge (Config), je Sorte Auflage
  // aufsteigend. Der Export des Shops ist genau so sortiert.
  const sortenReihenfolge = [];
  for (const r of alt) if (!sortenReihenfolge.includes(String(r.paper__id))) sortenReihenfolge.push(String(r.paper__id));
  for (const z of zeilen) if (!sortenReihenfolge.includes(String(z.sortenId))) sortenReihenfolge.push(String(z.sortenId));
  const sortiert = [...zeilen].sort((a, b) =>
    sortenReihenfolge.indexOf(String(a.sortenId)) - sortenReihenfolge.indexOf(String(b.sortenId)) || a.auflage - b.auflage);
  const geschrieben = new Set();

  const neu = [];
  sortiert.forEach((zeile, index) => {
    const schluessel = `${zeile.sortenId}|${zeile.auflage}`;
    const vorlageZeile = vorlageNachSchluessel.get(schluessel) ?? null;
    const obj = { ...(referenzJeSorte.get(String(zeile.sortenId)) ?? referenz) };
    // id aus der Vorlage → Staffel wird aktualisiert; leer → neu angelegt
    obj.id = idsUebernehmen && vorlageZeile?.id != null ? vorlageZeile.id : null;
    if (vorlageZeile) geschrieben.add(schluessel);
    if (obj.id != null) bericht.zeilenMitId += 1; else bericht.zeilenNeu += 1;
    obj.bezeichnung = `${zeile.auflage} Stück`;
    obj.wert = zeile.auflage;
    obj.preis = rundeCent(zeile.preis);
    obj.sortiercode = (index + 1) * 10;
    obj.paper__id = zeile.sortenId;
    obj.artikelnummer = zeile.artikelnummer;
    const offset = basisWT == null ? 0 : zeile.liefertage - basisWT;
    if (offset < 0 || offset > LIEFERTAGE_OFFSET_MAX) {
      bericht.warnungen.push(`Liefertage-Offset ${offset} außerhalb 0–${LIEFERTAGE_OFFSET_MAX} (Zeile ${zeile.papierId} × ${zeile.auflage}).`);
    }
    obj.liefertage = Math.min(Math.max(offset, 0), LIEFERTAGE_OFFSET_MAX);
    for (const spalte of dynSpalten) {
      const zelle = dynoptZelle({ ...spalte, zeile, artikel, config, mapping, bericht });
      let wert = spalte.istRai ? zelle.rai : zelle.wert;
      if (typeof wert === 'number' && !spalte.istRai) wert = rundeCent(wert);
      obj[spalte.feld] = wert;
      bericht.zellen += 1;
      if (wert === null) bericht.leereZellen += 1;
    }
    neu.push(obj);
  });
  preisBlock.rows = objectsToBlockRows(preisBlock, neu);
  bericht.zeilen = neu.length;
  // Vorlagenzeilen ohne Gegenstück (Sorte nicht mehr aktiv, Staffel entfallen):
  // nicht in der Datei → der Import löscht sie. Nur als Zahl im Bericht, bei
  // fremder Vorlage sind es ohnehin alle.
  if (idsUebernehmen) bericht.vorlagenzeilenEntfallen = [...vorlageNachSchluessel.keys()].filter((k) => !geschrieben.has(k)).length;
  return { model, bericht };
}

// Komfort: direkt die Matrix (Array of Arrays) für XLSX.utils.aoa_to_sheet.
export function buildImportMatrix(args) {
  const { model, bericht } = buildImportModel(args);
  return { matrix: serializeLeadprintExport(model), bericht };
}

// Welcher Mapping-Artikel steckt in einer Export-Datei? (article.id → key)
export function artikelKeyAusVorlage(templateMatrix, mapping) {
  const model = parseLeadprintExport(templateMatrix);
  const block = findBlock(model, 'article.');
  if (!block) return null;
  const id = String(blockToObjects(block)[0]?.id ?? '');
  return (mapping.artikel ?? []).find((a) => a.leadprintId != null && String(a.leadprintId) === id)?.key ?? null;
}
