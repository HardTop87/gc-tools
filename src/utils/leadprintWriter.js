// Datenschicht des Leadprint-Import-Writers: verbindet die Preisberechnung
// (leadprintMapper) mit den Shop-IDs aus leadprintMapping.rst.json zu dem
// Zeilenmodell, das später in den articlePrices-Block einer Export-Datei
// geschrieben wird (Konzept Kap. 3.3: Basispreis = kleinste Seitenoption,
// Seitenzahl als additiver Aufschlag je Listenwert, leere Zellen = Option im
// Shop nicht wählbar — niemals 0).
//
// Bewusst noch OHNE die mit-Umschlag-Artikel: Deren Zeilen-Basis (welches
// Umschlagpapier trägt den Basispreis der Zeile?) wird erst mit dem neuen
// Backend-Export festgelegt. Die ohne-Umschlag-Artikel sind vollständig.

import { computeArtikelOhneUmschlag, SEITEN_STUETZSTELLEN } from './leadprintMapper';

// P3: 4 Seiten Inhalt gibt es nur mit Umschlag — die mit-Umschlag-Artikel
// bekommen deshalb eine eigene Stützstellenliste mit der 4 am Anfang.
// (Der Listenwert „4" existiert im Backend bereits; die ohne-Umschlag-Artikel
// lassen seine Zelle leer → im Shop nicht wählbar.)
export const SEITEN_STUETZSTELLEN_MIT_UMSCHLAG = [4, ...SEITEN_STUETZSTELLEN];

// Routen-Tag je Preiszeile (Entscheidung Armin 13.08.): wandert als Suffix in
// articlePrices.artikelnummer (z. B. BRO-RST-A4H-44-GC), damit der
// Enfocus-Switch-Flow den Produzenten aus der Auftrags-XML lesen kann.
//
// ACHTUNG, keine seltene Abweichung (H2, Bug-Hunt V5, Stand 12.10.2026):
// Getaggt wird die Route der 8-Seiten-BASISZELLE der Zeile (Papier × Auflage).
// Die Seitenzahl-Zellen derselben Zeile können eine andere Engine-Route haben —
// systematisch ab 48 Seiten bei Auflage ≥ 100 (GC-Seitenlimit → Partner).
// Gemessen A4H: 1.174 von 4.305 bepreisten Zellen (27 %) tragen ein anderes
// Tag als ihre Engine-Route (GC→KOPP 641, GC→ILDA 533), betroffen 117 von
// 260 Zeilen. Ein Switch-Flow, der den Produzenten nur aus dem Tag liest,
// leitet diese Aufträge falsch. Entscheidung Armin/Guido offen:
//   (a) so dokumentieren („Basiszellen-Route", Rechner bleibt die Auskunft),
//   (b) Tag „MIX" bei Zeilen mit gemischten Routen,
//   (c) /api/route für Switch priorisieren (exakt je Auftrag).
// Bis dahin: Logik unverändert, der Tag ist die Basiszellen-Route.
export const ROUTE_TAGS = {
  'GC (Horizon)': 'GC',
  'Partner Kopp': 'KOPP',
  'Partner ILDA': 'ILDA',
};

function seitenListenwerte(mapping) {
  const feld = mapping.optionsfelder?.['Seitenanzahl Innenteil'];
  return feld?.werte ?? {};
}

// Preiszeilen eines ohne-Umschlag-Artikels im Shop-Modell:
//   je freigeschaltetem Inhaltspapier × Auflagenstaffel eine Zeile mit
//   { sortenId, papierId, auflage, preis (Basis = kleinste Seitenoption),
//     route, produktionszeitWT (Basiszelle), liefertage (= längste
//     Produktionszeit aller Zellen der Zeile — „Zeilenmaximum", 10.10.2026),
//     aufschlaege: { <listenwertId>: betrag | null } }
// Fehlende Shop-IDs werden gesammelt statt still übersprungen.
export function buildPreiszeilenOhneUmschlag({ config, mapping, artikelKey }) {
  const artikel = (mapping.artikel ?? []).find((a) => a.key === artikelKey);
  if (!artikel) return { zeilen: [], probleme: [`Artikel ${artikelKey} nicht im Mapping.`] };
  if (artikel.umschlag !== 'ohne') {
    return { zeilen: [], probleme: [`Artikel ${artikelKey} ist kein ohne-Umschlag-Artikel.`] };
  }

  const probleme = [];
  const listenwerte = seitenListenwerte(mapping);
  for (const seiten of SEITEN_STUETZSTELLEN) {
    if (!listenwerte[String(seiten)] && !listenwerte[seiten]) {
      probleme.push(`Seitenanzahl ${seiten}: kein Listenwert im Mapping (Gruppe 5628).`);
    }
  }

  const berechnungen = computeArtikelOhneUmschlag({
    config,
    formatKey: artikel.format,
    farbigkeit: artikel.farbigkeit,
    auflagen: mapping.auflagen ?? [],
  });

  const zeilen = [];
  for (const zeile of berechnungen) {
    const sorte = mapping.sorten?.[zeile.pInhaltId];
    if (!sorte?.sortenId) {
      probleme.push(`Papier ${zeile.pInhaltId}: keine sortenId im Mapping.`);
      continue;
    }
    const routeTag = ROUTE_TAGS[zeile.route];
    if (!routeTag) {
      probleme.push(`Route „${zeile.route}" hat keinen Tag in ROUTE_TAGS.`);
      continue;
    }
    if (!artikel.artikelnummer) {
      probleme.push(`Artikel ${artikelKey}: keine artikelnummer im Mapping.`);
      continue;
    }
    const aufschlaege = {};
    for (const seiten of SEITEN_STUETZSTELLEN) {
      const listenwertId = listenwerte[String(seiten)] ?? listenwerte[seiten];
      if (!listenwertId) continue;
      aufschlaege[listenwertId] =
        seiten === zeile.basisSeiten ? 0 : zeile.aufschlaege[seiten] ?? null;
    }
    zeilen.push({
      sortenId: sorte.sortenId,
      papierId: zeile.pInhaltId,
      auflage: zeile.auflage,
      preis: zeile.basisPreis,
      route: zeile.route,
      produktionszeitWT: zeile.produktionszeitWT,
      // Shop-Spalten (Option 2 + Bonus): Routen-Tag in der Artikelnummer,
      // Liefertage = Zeilenmaximum: Die Zeile (Papier × Auflage) trägt im Shop
      // nur einen Liefertermin, der für jede Seitenzahl-Zelle reichen muss.
      // Gemessen (10.10.2026, 270.610 Zellen): 0 gebrochene Zusagen, 13 % der
      // Zellen zeigen einen Tag länger als nötig — jede feldweite Alternative
      // (Offset an den Seiten-Listenwerten) ist deutlich schlechter.
      artikelnummer: `${artikel.artikelnummer}-${routeTag}`,
      liefertage: zeile.produktionszeitWTMax,
      routenSeiten: zeile.routenSeiten,
      aufschlaege,
    });
  }

  return { zeilen, probleme: [...new Set(probleme)] };
}

// Abgleich Config ↔ Mapping: Welche Shop-IDs fehlen, welche Mapping-Einträge
// zeigen auf Papiere, die es in der Config nicht mehr gibt? Läuft vor jedem
// Writer-Lauf und als Test — Preisdaten dürfen nie still unvollständig in den
// Shop wandern.
export function pruefeMappingVollstaendigkeit(config, mapping) {
  const probleme = [];
  const paperIds = new Set(config.papiere.map((p) => p.id));

  // 1. Jedes Inhaltspapier der GC-Formate braucht eine Sorte im Shop
  const inhaltIds = new Set();
  const umschlagIds = new Set();
  for (const format of config.formate) {
    if (format.isBanner) continue; // Banner-Artikel sind (noch) nicht im Shop-Umfang
    for (const id of format.papiereInhalt) inhaltIds.add(id);
    for (const id of format.papiereUmschlag) umschlagIds.add(id);
  }
  for (const id of inhaltIds) {
    if (!mapping.sorten?.[id]?.sortenId) probleme.push(`Inhaltspapier ${id}: keine sortenId im Mapping.`);
  }
  for (const id of umschlagIds) {
    if (!mapping.umschlagListenwerte?.[id]?.listenwertId) {
      probleme.push(`Umschlagpapier ${id}: kein Listenwert im Mapping (Gruppe 5555).`);
    }
  }

  // 2. Mapping-Einträge ohne Gegenstück in der Config (Papier entfernt/umbenannt)
  for (const id of Object.keys(mapping.sorten ?? {})) {
    if (!paperIds.has(id)) probleme.push(`Mapping-Sorte ${id}: Papier existiert nicht mehr in der Config.`);
  }
  for (const id of Object.keys(mapping.umschlagListenwerte ?? {})) {
    if (!paperIds.has(id)) probleme.push(`Mapping-Umschlag ${id}: Papier existiert nicht mehr in der Config.`);
  }

  // 3. Seitenzahl-Listenwerte: alle Stützstellen inkl. der 4 (P3)
  const listenwerte = seitenListenwerte(mapping);
  for (const seiten of SEITEN_STUETZSTELLEN_MIT_UMSCHLAG) {
    if (!listenwerte[String(seiten)] && !listenwerte[seiten]) {
      probleme.push(`Seitenanzahl ${seiten}: kein Listenwert im Mapping (Gruppe 5628).`);
    }
  }

  // 4. Jede Format×Farbigkeit×Umschlag-Kombination der Config braucht einen Artikel
  // mit Artikelnummer (Basis des Routen-Tags in articlePrices.artikelnummer) und
  // Leadprint-ID (Ziel der Weiterleitungen in den .rai-Spalten; ohne ID bliebe
  // die Option bei allen Zwillingen still leer — M9, Bug-Hunt V5)
  for (const a of mapping.artikel ?? []) {
    if (!a.artikelnummer) probleme.push(`Artikel ${a.key}: keine artikelnummer im Mapping.`);
    if (!a.leadprintId) probleme.push(`Artikel ${a.key}: keine leadprintId im Mapping.`);
  }
  const artikelKeys = new Set((mapping.artikel ?? []).map((a) => a.key));
  for (const format of config.formate) {
    if (format.isBanner) continue;
    for (const farbigkeit of ['1c', '4c']) {
      for (const umschlag of ['ohne', 'mit']) {
        const key = `${format.key}|${farbigkeit}|${umschlag}`;
        if (!artikelKeys.has(key)) probleme.push(`Artikel ${key}: fehlt im Mapping.`);
      }
    }
  }

  return probleme;
}
