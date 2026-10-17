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
// und der komplette articlePrices-Block. Preiszeilen bekommen KEINE id → der
// Import legt sie neu an und löscht alle alten (offizielle Doku: Staffeln, die
// in der Datei fehlen, werden entfernt). Leere Zellen bleiben leer — nie 0.

import {
  blockToObjects,
  findBlock,
  objectsToBlockRows,
  parseLeadprintExport,
  serializeLeadprintExport,
} from './leadprintExportFile';
import { buildPreiszeilenOhneUmschlag, pruefeMappingVollstaendigkeit } from './leadprintWriter';

// Zielzustand der Feld-Flags je Artikel (Checkliste A4). SquareFold (5629)
// darf aus sein — es ist ohnehin unbepreist.
export const ZIEL_FELDER_AN = [12913, 5561, 5628, 5559, 5560, 5563, 5556, 5555, 5562, 13453];
export const ZIEL_FELDER_AUS = [5470, 5510, 5516];
export const FELD_PRODUKTIONSGESCHWINDIGKEIT = 13453;

// Liefertermin je Preiszeile ist in Leadprint ein Offset auf „Versandfertig in"
// (article.produktionszeit), Auswahlliste 0–10 Tage (Doku article_eximport).
const LIEFERTAGE_OFFSET_MAX = 10;

function rundeCent(wert) {
  return Math.round(wert * 100) / 100;
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

// Zwillingsartikel für Weiterleitungen: gleicher Artikel bis auf EINE Dimension.
// Rückgabe: { wert: 0, rai: <leadprintId> } oder die leere Zelle, wenn es den
// Zwilling nicht gibt. Ein Zwilling OHNE leadprintId (Tippfehler, Artikel noch
// nicht angelegt) wird nicht still zur Leerzelle, sondern einmal je Ziel im
// Bericht gemeldet (M9, Bug-Hunt V5) — die Option fehlt sonst unbemerkt im Shop.
function weiterleitung({ mapping, artikel, aenderung, name, schluessel, bericht }) {
  const leer = { wert: null, rai: null };
  const ziel = { format: artikel.format, farbigkeit: artikel.farbigkeit, umschlag: artikel.umschlag, ...aenderung };
  const zwilling = (mapping.artikel ?? []).find(
    (a) => a.format === ziel.format && a.farbigkeit === ziel.farbigkeit && a.umschlag === ziel.umschlag,
  );
  if (!zwilling) return leer;
  if (!zwilling.leadprintId) {
    const meldung = `Weiterleitung ${name}/${schluessel}: Zwilling ${zwilling.key} hat keine leadprintId — Option bleibt leer.`;
    if (!bericht.warnungen.includes(meldung)) bericht.warnungen.push(meldung);
    return leer;
  }
  return { wert: 0, rai: zwilling.leadprintId };
}

// Prüft die Vorlage gegen den Zielzustand (Checkliste) und liefert die
// Basis-Produktionszeit des Artikels. Fehler = Import nicht sinnvoll;
// Warnungen = Import läuft, Armin sollte es aber im Backend ansehen.
function pruefeVorlage(model, artikel, bericht) {
  const articleBlock = findBlock(model, 'article.');
  if (!articleBlock || !articleBlock.rows.length) {
    bericht.fehler.push('Vorlage ohne article-Block.');
    return null;
  }
  const art = blockToObjects(articleBlock)[0];
  if (String(art.id) !== String(artikel.leadprintId)) {
    bericht.fehler.push(`Vorlage gehört zu Artikel ${art.id}, erwartet ${artikel.leadprintId} (${artikel.key}).`);
  }
  const basisWT = Number(art.produktionszeit);
  if (!Number.isFinite(basisWT)) {
    bericht.fehler.push('article.produktionszeit fehlt oder ist keine Zahl (Basis der Liefertage).');
  }
  if (Number(art.glob_artikel_rabatt) !== 3) {
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
function schreibeArtikelFelder(model, artikel, bericht) {
  const block = findBlock(model, 'article.');
  if (!block || !block.rows.length) return;
  const setze = (feld, wert) => {
    const i = block.header.findIndex((h) => String(h) === `article.${feld}`);
    if (i < 0) { bericht.warnungen.push(`Vorlage ohne Spalte article.${feld} — bleibt wie im Backend.`); return; }
    if (String(block.rows[0][i] ?? '') !== String(wert)) bericht.geaendert.push(`${feld}: „${block.rows[0][i] ?? ''}" → „${wert}"`);
    block.rows[0][i] = wert;
  };
  if (artikel.bezeichnung) setze('bezeichnung', artikel.bezeichnung);
  if (artikel.artikelnummer) setze('artikelnummer', artikel.artikelnummer);
  setze('unsichtbar', artikel.einstieg ? 0 : 1);
}

// Sorten-Flags: genau die Inhaltspapiere des Formats (laut Config) an, alles
// andere aus. Sorten ohne Spalte in der Vorlage können nicht geschaltet werden.
function schreibeSortenFlags(model, config, mapping, artikel, bericht) {
  const block = findBlock(model, 'articleGlobalVariety');
  if (!block) {
    bericht.warnungen.push('Vorlage ohne articleGlobalVariety-Block — Sorten-Flags bleiben wie im Backend.');
    return;
  }
  const format = config.formate.find((f) => f.key === artikel.format);
  const gewollt = new Map();
  for (const papierId of format?.papiereInhalt ?? []) {
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
function dynoptZelle({ listenwertId, istBp, istRai, feldInfo, zeile, artikel, mapping, bericht }) {
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
      // Auf den Cent exakt: Basis und Zellpreis werden getrennt gerundet,
      // damit Basis + Aufschlag genau dem gerundeten Engine-Preis entspricht.
      return { wert: rundeCent(zeile.preis + aufschlag) - rundeCent(zeile.preis), rai: null };
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
      if (schluessel === artikel.umschlag) return { wert: 0, rai: null };
      return springe({ umschlag: schluessel }, schluessel);
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

// Baut das Modell der Import-Datei für einen ohne-Umschlag-Artikel.
// nurPreisbloecke: siehe reduziereAufPreisbloecke.
export function buildImportModel({ templateMatrix, config, mapping, artikelKey, nurPreisbloecke = false }) {
  const ergebnis = buildVollesModell({ templateMatrix, config, mapping, artikelKey });
  if (nurPreisbloecke && !ergebnis.bericht.fehler.length) {
    ergebnis.model = reduziereAufPreisbloecke(ergebnis.model);
    // Die Minimaldatei trägt nur article.id — Bezeichnung, Artikelnummer und
    // Sichtbarkeit bleiben im Backend, also meldet der Bericht sie auch nicht
    // als geändert (N12).
    ergebnis.bericht.geaendert = [];
  }
  return ergebnis;
}

function buildVollesModell({ templateMatrix, config, mapping, artikelKey }) {
  const bericht = { artikelKey, fehler: [], warnungen: [], geaendert: [], zeilen: 0, leereZellen: 0, zellen: 0, sortenAn: [], sortenAus: [], unbekannteGruppen: [], referenzzeile: null };
  const model = parseLeadprintExport(templateMatrix);

  const artikel = (mapping.artikel ?? []).find((a) => a.key === artikelKey);
  if (!artikel) {
    bericht.fehler.push(`Artikel ${artikelKey} nicht im Mapping.`);
    return { model, bericht };
  }
  if (artikel.umschlag !== 'ohne') {
    bericht.fehler.push('Der Import-Builder kann bisher nur ohne-Umschlag-Artikel.');
    return { model, bericht };
  }
  for (const p of pruefeMappingVollstaendigkeit(config, mapping)) bericht.warnungen.push(`Mapping: ${p}`);

  const basisWT = pruefeVorlage(model, artikel, bericht);
  schreibeArtikelFelder(model, artikel, bericht);
  schreibeSortenFlags(model, config, mapping, artikel, bericht);

  const preisBlock = findBlock(model, 'articlePrices');
  if (!preisBlock) {
    bericht.fehler.push('Vorlage ohne articlePrices-Block.');
    return { model, bericht };
  }
  const { zeilen, probleme } = buildPreiszeilenOhneUmschlag({ config, mapping, artikelKey });
  for (const p of probleme) bericht.fehler.push(`Writer: ${p}`);
  if (bericht.fehler.length) return { model, bericht };

  // Referenzzeile: Nicht-Preis-Spalten (Pakete, Gewicht, …) werden von der
  // ersten vorhandenen Zeile übernommen — bevorzugt die 1-Stück-Zeile.
  const alt = blockToObjects(preisBlock);
  const referenz = alt.find((r) => Number(r.wert) === 1) ?? alt[0] ?? {};
  bericht.referenzzeile = referenz.id ?? null;

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
    if (seiten === '4') continue;
    if (!dynSpalten.some((s) => s.gruppe === String(seitenFeld.gruppenId) && s.listenwertId === String(lwId))) {
      bericht.warnungen.push(`Vorlage hat keine Spalte für Seitenanzahl ${seiten} (Listenwert ${lwId}) — der Aufschlag kann nicht geschrieben werden.`);
    }
  }

  const neu = [];
  zeilen.forEach((zeile, index) => {
    const obj = { ...referenz };
    obj.id = null; // neu anlegen; alte Staffeln löscht der Import
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
      const zelle = dynoptZelle({ ...spalte, zeile, artikel, mapping, bericht });
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
  return (mapping.artikel ?? []).find((a) => String(a.leadprintId) === id)?.key ?? null;
}
