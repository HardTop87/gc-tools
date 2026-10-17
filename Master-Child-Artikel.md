# Master- und Childartikel im Druckshop

Wann sich die Funktion lohnt, mit Beispielen aus der Druckerei

Stand 11.10.2026 · Armin Rohrmoser

## Kurzfassung

Master- und Childartikel bündeln Varianten eines einzigen Produkts, die denselben Preis haben und sich nur im Inhalt unterscheiden: Design, Druckvorlage, Text, Zielgruppe oder Kunde. Der Master trägt die komplette Kalkulation. Das Child hat keine eigene Preistabelle, keine Sorten und keine Optionsfelder.

Für die Rückstichheftungen passt das nicht, weil sich dort gerade die Preise je Format, Farbigkeit und Umschlag unterscheiden. Lohnend ist die Funktion für Vorlagen-Produkte, Stammkunden-Artikel, Angebote für Hochschulen und Vereine sowie für Landingpages, die dasselbe Produkt unter anderem Namen zeigen.

## So funktioniert es

Der Master ist ein vollständiger Artikel mit Kalkulation. Jedes Child hängt per Auswahlfeld an genau einem Master und übernimmt dessen Preise, Sorten und Optionen unverändert. Im Shop zeigt der Master seine Childs als Auswahl.

Aufbau: Der Masterartikel trägt Preistabelle mit Staffeln, Sorten (Papiere) und dynamische Optionsfelder mit Aufschlägen. Diese gelten für alle Childs gleich. Darunter hängen die Childs, zum Beispiel „Design A" (eigener Name und Text, eigene Bilder, eigene Gestaltungsvorlage), „Kunde Müller" (nur für diesen Kunden sichtbar, Druckdatei hinterlegt, eigene Artikelnummer) und „Landingpage" (eigene URL und SEO-Texte, eigene Warengruppe, eigener Subshop). Die Zeichnung steht in der PDF-Fassung und im Online-Dokument.

Was ein Child selbst einstellen kann, laut Backend-Formular (Druckshop 9.4.4):

| Bereich | Einstellungen im Child |
| --- | --- |
| Allgemein | Bezeichnung, Artikelnummer, Status, Beschreibungen, Artikelmerkmale, Infotext, Versand und Verpackung |
| SEO | Browser-Titel, Bezeichnung-URL, Canonical-URL, Meta-Texte, strukturierte Daten |
| Sichtbarkeit | Warengruppe und zusätzliche Warengruppen, Hauptshop ausblenden, Zuweisung zu Subshops, Sortierung |
| Kundenbezug | Benutzerbezogener Artikel: nur für bestimmte Kunden sichtbar, hinterlegte Datei wird bei Bestellung in den Druckordner kopiert |
| Produktion | Produktionszeit, fixer Drucktag, zugeordneter Dienstleister |
| Dateien | Druckvorlagen zum Download, Beispiel-Vorschaudateien, Datei-Upload, Online-Gestaltung (Creator, Printlounge) |
| Bilder | Vorschaubilder, Galerie, Garantielabel |

Ein Child kann die Optionen des Masters weder vorbelegen noch einschränken. Der Tab „Optionen“ enthält nur die große Galerieansicht.

## Wann es sich lohnt

Master und Child lohnen sich, sobald viele Varianten dieselbe Kalkulation teilen. Die Preise werden dann einmal im Master gepflegt, jede Variante bekommt trotzdem eine eigene Seite, eigene Dateien oder einen eigenen Kundenkreis.

| Einsatzfall | Im Master (gemeinsam) | Im Child (je Variante) | Beispiele aus der Druckerei |
| --- | --- | --- | --- |
| Gestaltungsvorlagen | Format, Papiere, Staffeln, Veredelung | Design mit Vorschaubildern und Vorlage im Creator, eigener Name und Text | Visitenkarten in 30 Designs, Hochzeits- und Einladungskarten, Weihnachtskarten, Fotokalender-Layouts, Flyer-Vorlagen für Handwerker |
| Stammkunden- und Firmenartikel | Kalkulation des Produkts | Nur für diesen Kunden sichtbar, Druckdatei hinterlegt, eigene Artikelnummer | Briefpapier und Visitenkarten je Mitarbeiter einer Firma, Speisekarten eines Restaurants, Lieferschein- und Formularblöcke, Eintrittskarten eines Theaters |
| Hochschulen und Vereine | Bindung, Papiere, Staffeln, Optionen wie Prägung | Deckblatt- und Prägevorlagen, Abgabehinweise im Infotext, eigene Landingpage | Abschlussarbeit Hardcover je Hochschule, Vereinsflyer je Verein |
| Landingpages für Suchmaschinen | Das ganze Produkt | Eigene URL, eigener Titel und Text, eigene Bilder, eigene Warengruppe | Flyer als „Speisekarten drucken“, „Praxisflyer“, „Eventflyer“; Plakat als „Konzertplakat“; Broschüre als „Vereinsheft“, „Jahresbericht“ |
| Subshops und B2B-Portale | Das ganze Produkt | Zuweisung zu einem Subshop, eigene Beschreibung und Artikelnummer | Firmenportal mit den freigegebenen Drucksachen eines Kunden, Weißmarken-Shop eines Partners |

Beim Stammkunden-Artikel gibt es eine Grenze: Der Kunde wählt Format, Seiten und Papier weiterhin selbst, weil ein Child die Optionen des Masters nicht festlegen kann. Am besten passt das zu Produkten mit wenigen Optionen, etwa Visitenkarten oder Briefpapier.

## Wann es nicht passt

Sobald sich Varianten im Preis, in den Papieren oder in den möglichen Optionen unterscheiden, sind es eigene Artikel. Ein Child kann keinen eigenen Preis tragen.

Die Rückstichheftungen sind genau dieser Fall. Sie laufen im Shop als 16 Artikel: 4 Formate, 2 Farbigkeiten, jeweils ohne und mit Umschlag. Jeder Artikel hat eigene Preise, eigene Seitenlimits und eigene Papiere, A5 Hoch etwa 11 statt 13 Inhaltspapiere. Der Wechsel zwischen ihnen läuft über Weiterleitungen an den Optionsfeldern, die laut Doku Menge und gewählte Optionen mitnehmen. Ein Master mit 16 Childs würde alle auf dieselben Preise zwingen.

Weitere typische Fälle für eigene Artikel statt Childs:

- Formate mit eigenem Bogenausschuss, etwa Flyer DIN A6, A5 und DIN lang
- Bindearten mit eigener Kalkulation, etwa Softcover und Hardcover
- Produkte mit eigenem Produktionsweg, etwa intern gedruckt gegenüber Partnerfertigung mit anderem Preis

## Entscheidungshilfe

Ein neues Produkt wird zum Child, wenn alle drei Fragen mit Ja beantwortet sind. Sonst wird es ein eigener Artikel.

1. Hat die Variante bei gleicher Menge und gleichen Optionen exakt denselben Preis wie die anderen?
2. Stehen dem Kunden dieselben Papiere und dieselben Optionen zur Wahl?
3. Unterscheidet sich die Variante nur in Inhalt, Datei, Darstellung oder Kundenkreis?

## Getestet und offen

Am 11.10.2026 haben wir im Backend einen Test-Master und ein Child angelegt und alle Tabs des Childs gesichtet. Der Test ist beendet, die Test-Artikel werden gelöscht. Die Darstellung im Shop haben wir nicht mehr angeschaut, weil das Ergebnis für die Rückstichheftungen schon aus dem Backend feststand.

Vor einem echten Einsatz offen:

- [ ] Wie zeigt der Shop den Master und seine Childs an: Liste, Kacheln oder Auswahlfeld?
- [ ] Erscheinen Childs zusätzlich einzeln in ihrer Warengruppe?
- [ ] Welche Bezeichnung und Artikelnummer stehen im Warenkorb und in der Auftrags-XML, die des Childs oder die des Masters?
- [ ] Erbt das Child die Produktionszeit des Masters, oder gilt sein eigenes Feld, das beim Anlegen auf 0 steht?
- [ ] Muss das Modul für weitere Shops freigeschaltet werden?

Online-Dokument: https://claude.ai/code/artifact/a1668dc4-c27d-4ad5-9da6-1c6ac8cc5374

Quellen: [Master- und Childartikel](https://beprint.atlassian.net/wiki/spaces/PS/pages/22353754) und [Slaveartikel](https://beprint.atlassian.net/wiki/spaces/PS/pages/22347947) im be.print-Wiki, Backend Druckshop 9.4.4 (Shop 666).
