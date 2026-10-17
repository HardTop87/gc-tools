# Claude-Design-Entwurf „GC Tools Konzept Prototype" — Bewertung und Umsetzungsplan

Stand 17.10.2026 · Quelle: `~/Downloads/GC Tools Konzept Prototype-handoff.zip` (Hauptdatei `project/GC Tools Konzept.dc.html`, 188 KB, klickbarer Prototyp mit eingebetteter Spezifikation). Entpackt liegt der Entwurf nicht im Repo; für die Umsetzung sollte er nach `design_handoff_gc_tools_ui/` kopiert werden (gitignoriert, wie der erste Entwurf).

## 1. Was der Entwurf liefert

Der Prototyp deckt alles aus dem Prompt ab und trifft die Struktur gut:

- **Navigation:** TopBar (Home · Rechner · PayPal Export · Rhaetia-Post-Manager · Version · Verwaltung). Verwaltung mit linker Spalte: *Kalkulationsbasis* (Gemeinsame Basis → Papierpreise, Klick & Bogen, Veredelung & Auftrag; Rückstichheftung → Klick & Bogen, Veredelung & Auftrag, Faktoren & Grenzen, Verarbeitungstabellen, Artikel (16); Flyer/Poster/Abschlussarbeiten geplant) und *Ausrollen* (Shop-Export). Revisionen als Seitenpanel.
- **Vererbung je Feld:** Artikel › Produkt › Basis, erster gesetzter Wert gilt. Auf Produktebene ein Umschalter je Feldgruppe „Gemeinsame Basis | Eigene Werte". Im Artikel `InheritanceBadge` (Basis / Produkt / Artikel / im Entwurf geändert) plus Quellzeile. Ändern eines geerbten Werts öffnet den **Geltungsbereich-Dialog** (Vorauswahl „Nur dieser Artikel").
- **Artikel-Detail:** Block A „Wirkt in der Kalkulation" (Klickpreise 1c/4c, Einrichtekosten, Umschlag-Zuschlag, Cello-Stückpreise, WV-Tabelle als Faktor oder eigene Staffel) und Block B „Wirkt nur im Shop" (Grundaufschlag `glob_artikel_rabatt`, 10 Service-Aufschläge, 4 Versand-Aufschläge, Grundwerte, Identität & Sichtbarkeit mit gesperrter Shop-ID). Dazu eine Preiszeilen-Vorschau (geerbt / Artikel / Shop) und ein Shop-Stand-Kasten.
- **Artikel-Übersicht:** Tabelle mit Filtern (Format, Farbigkeit, Umschlag), Spalten Bezeichnung, Artikelnr., Shop-ID, Sichtbar, Überschreibungen, Grundaufschlag, letzter Export; Batch-Aktionen (Grundaufschlag setzen, Sichtbar/Unsichtbar, zum Export vormerken).
- **Shop-Export:** Quelle = veröffentlichter Stand (Entwurf wird ausdrücklich ausgeschlossen), Produktwahl, Preisvergleich Rev. X gegenüber letztem Export (Kennzahlen + aufklappbare geänderte Zellen mit diff-up/diff-down), Prüfstatus je Artikel (Bereit/Warnung/Fehler), ZIP-Erzeugung, Upload-Bestätigung als manuelles Häkchen je Artikel. Ehrlich: „Die App behauptet keinen Upload, den sie nicht sehen kann."
- **Rechner:** Produktwahl oben links, Umschalter Einzelpreis | Staffel, Eingabeleiste mit Inline-Fehlern, Zuordnungszeile „Shop-Artikel" (Name, Artikelnr., ID, Überschreibungen, „Artikel verwalten", „Im Shop öffnen"), `RouteCard` in fester Reihenfolge GC/Kopp/ILDA mit Zuständen empfohlen/günstigste/Alternative/nicht möglich und Grund in derselben Zeile, „Alle öffnen" für die Aufschlüsselung, Umschalter „Shop-Preis inkl. Grundaufschlag". `StaffelTable` mit frei eingebbaren Auflagen (max. 10), CSV/Zwischenablage.
- **Komponenten-Spezifikation:** InheritanceBadge, OverrideField, ExportStatusRow, RouteCard, StaffelTable mit Zuständen und Token-Zuordnung.

## 2. Abweichungen zur Realität, die vor der Umsetzung korrigiert werden müssen

| Punkt | Prototyp | Realität | Konsequenz |
|---|---|---|---|
| Engine-Stand | „nach Repo-Stand 2.2.0 nachgebildet" | 2.6.0: Kassen-Anker 1–10 Ex., Dickenaufschlag, Makulatur-Kurve | Aufschlüsselung braucht Zeilen für Dickenaufschlag, Makulaturbogen, Kassen-Anker; Staffel 1–10 zeigt die Anker-Gerade |
| Umschlag-Zuschlag ab Auflage | 11 | 1 | nur Platzhalter, aber Vorschau-Zahlen stimmen nicht |
| Veröffentlichen | Entwurfsleiste, Buttons „Verwerfen / Veröffentlichen", Konfliktdialog mit **„Trotzdem veröffentlichen"** | Auto-Publish 900 ms nach jeder Änderung, kein Force | **Entscheidung nötig** (siehe 3.1); „Trotzdem veröffentlichen" ist genau der Lost-Update-Pfad aus Bug-Hunt V5 H1 und sollte **nicht** gebaut werden |
| Revisionsverlauf | mit Autor („M. Keller") und Notiz | API speichert nur Rev + Zeitpunkt | Autor/Notiz entweder weglassen oder API um `note`/`by` erweitern (kein Login-Konzept je Person vorhanden) |
| Artikel-IDs | `RST-A4H-44-OU`, Shop-IDs 204xx | `BRO-RST-A4H-44`, Shop-IDs 1112051233 ff. | nur Daten |
| Weiterleitungen | nur Sichtbarkeits-Flag | Zwillings-Weiterleitungen (Format/Farbigkeit/Umschlag) kommen aus dem Mapping | Artikel-Detail sollte die Weiterleitungen lesend zeigen („erreichbar über …") |
| mit-Umschlag-Artikel | als fertig behandelt | Preiszeilen-Modell für mit-U noch nicht entschieden (Variante A–D) | Shop-Export muss mit-U-Artikel als „Fehler: Modell offen" sperren, bis entschieden |

## 3. Antworten auf die zwölf offenen Design-Fragen des Prototyps

Empfehlung jeweils zuerst; wo Armin oder Guido entscheiden müssen, steht es dabei.

1. **Rechner und Artikel-Überschreibungen anwenden?** Ja. Der Rechner löst die passende Artikel-Konfiguration auf und rechnet mit den effektiven Werten; die Zuordnungszeile zeigt „2 Überschreibungen". Gibt es keinen Artikel (Banner-Formate), gelten Produkt/Basis. Nur so stimmen Rechner und Shop überein.
2. **Welche Route speist die Preiszeilen?** Bleibt wie heute: empfohlene Route je Zelle, Preissprünge über die Grenzstaffeln 99/501 abgefangen (Entscheidung Juli 2026). Eine feste Route je Artikel würde ILDA ausschließen.
3. **Block B vererben?** Ja, aber schlank: **Produkt-Vorlage** für Block B (Standardwerte je Produkt, z. B. Grundaufschlag 3 %, Normalpaket 6,90) mit denselben Badges wie Block A. Flache Werte je Artikel bedeuten bei 16 Artikeln × 20 Feldern 320 Einzelpflege-Stellen. Die Batch-Aktion bleibt zusätzlich.
4. **Umschlag-Zuschlag Basis oder Produkt?** Produkt. Der Zuschlag ist GC-Horizon-spezifisch für Rückstichheftung; der Prototyp hat recht, mein Prompt war hier ungenau.
5. **WV-Überschreibung „Eigene Staffel"?** Für Version 1 nur der **Faktor, und nur auf die eigene Route (GC)**. Kopp- und ILDA-Tabellen sind Einkaufspreise, ein Faktor darauf ergibt keinen Sinn. „Eigene Staffel 11 × 13" streichen, bis ein konkreter Bedarf da ist.
6. **Abweichungsschwelle beim Ausrollen?** Nur markieren, nie blockieren. Schwelle als Setting (Start 10 %), Zeile wird gelb, ZIP bleibt möglich.
7. **Upload-Bestätigung?** **Ein Häkchen pro ZIP** mit Vorbelegung aller enthaltenen Artikel; Einzel-Häkchen nur, wenn ein Artikel einzeln exportiert wurde. Armin lädt die ZIP als Ganzes hoch.
8. **Shop-Artikel-ID ändern?** Entsperrbar mit Warnung (Prototyp). Die ID entsteht im Backend bei der Anlage und muss einmal eingetragen werden.
9. **Express doppelt?** Beides bleibt, aber getrennt: Express-Faktor ist Kalkulation (geht als Produktionsgeschwindigkeit-Option 10 % in den Shop). Der Shop-Aufschlag „24h-Service" bleibt 0 und wandert in eine eingeklappte Gruppe „weitere Shop-Felder (nicht genutzt)".
10. **Staffel-Export?** CSV reicht. Das Shop-Import-Format ist Sache des Shop-Exports, nicht des Rechners.
11. **Kassen-Anker 1–10 Exemplare?** Eigene Zeile in der Aufschlüsselung („Kassen-Anker: Aufschlag auf Normalpreis +x €"), weil Guido genau diese Zahlen prüft.
12. **Sichtbarkeit und Weiterleitung?** Nur das Flag pflegen; die Weiterleitungen aus dem Mapping lesend anzeigen (Frage 2 in Abschnitt 2).

### 3.1 Zusätzliche Entscheidung: Auto-Publish oder Entwurf/Veröffentlichen

Der Prototyp führt einen echten Entwurf ein (Änderungen sammeln, bewusst veröffentlichen). Heute veröffentlicht die Verwaltung jede Änderung nach 900 ms automatisch. Mit der Artikelebene und dem Geltungsbereich-Dialog wird Auto-Publish riskant (jede Zwischeneingabe wird sofort Produktionsstand). Empfehlung: **Entwurf/Veröffentlichen übernehmen**, Entwurf lokal (localStorage, wie das heutige Pending), Veröffentlichen explizit, Konflikt = neu laden und Entwurf erneut anwenden. Kein „Trotzdem veröffentlichen". Das ist eine Verhaltensänderung für Guido und sollte mit ihm abgestimmt werden.

### 3.2 Entscheidungen Armin (17.10.2026)

Alle zehn Empfehlungen aus der Zusammenfassung sind bestätigt: Entwurf mit bewusstem Veröffentlichen (**zusätzlich: Warnhinweis beim Verlassen der Seite, solange der Entwurf nicht veröffentlicht ist**, also `beforeunload` plus Abfrage beim Routenwechsel in der App), kein Force-Publish, Block B als Produkt-Vorlage mit Artikel-Überschreibung, WV-Faktor nur für GC, Rechner wendet Artikel-Überschreibungen an, Umschlag-Zuschlag beim Produkt, Upload-Bestätigung pro ZIP, Abweichungen nur markieren (10 %), Kassen-Anker als eigene Zeile, Reihenfolge P0 → P1/P3 → P2.

## 4. Umsetzungsplan in vier Paketen

**P0 Datenmodell (Voraussetzung für alles, kein UI).**
`pricingConfig` erweitern: `produkte.rst.settings` (Produkt-Überschreibungen der Basis-Settings, optional), `artikel[]` mit `key`, `produkt`, `format`, `farbigkeit`, `umschlag`, `leadprintId`, `artikelnummer`, `bezeichnung`, `sichtbar`, `kalkulation` (Überschreibungen: `klick1c`, `klick4c`, `setupKosten`, `gcUmschlag*`, `cello*`, `wvFaktorEigen`), `shop` (Block-B-Felder, 1:1 zu `article.*`). Produkt-Vorlage für Block B unter `produkte.rst.shop`. Resolver `resolveArtikel(config, key)` → effektive Settings mit Herkunft je Feld. Engine nutzt den bereits vorhandenen, bisher ungenutzten `settingsOverrides`-Pfad. Mapping-Datei behält nur die technischen Shop-IDs der Optionsfelder; Artikel-Stammdaten ziehen aus `leadprintMapping.rst.json` in die Config um (Migration). Validierung, `migratePricingConfig`, Tests, Writer/Builder auf den Resolver umstellen und `glob_artikel_rabatt` sowie die `article.*_aufschlag`-Felder aus Block B schreiben.

**P1 Verwaltung.** Seitenleiste, Artikel-Übersicht, Artikel-Detail (OverrideField, InheritanceBadge, Geltungsbereich-Dialog), Produkt-Umschalter „Basis | Eigene Werte", Entwurf/Veröffentlichen laut 3.1, Revisionen als Panel. Bestehende Publish-/409-/Verlauf-Logik bleibt die Datenschicht (mit den Fixes aus Bug-Hunt V5).

**P2 Shop-Export in der App.** Builder läuft heute als Node-Script mit Export-Vorlagen aus `Leadprint_Export/`. Für den Browser braucht er die Vorlagen: entweder (a) die 16 Export-Dateien einmal in den Blob laden („Vorlage aktualisieren" je Artikel) oder (b) die Blockstruktur der Vorlage im Mapping ablegen. Empfehlung (a), weil das Backend Spalten ändern kann. Dann: Prüfstatus, Preisvergleich gegen den letzten Export (Export-Stand je Artikel mit Rev + Zeitpunkt + Zellen-Hash im Blob), ZIP im Browser (JSZip oder xlsx-Bundle), Upload-Häkchen.

**P3 Rechner-Redesign.** RouteCard, StaffelTable, Shop-Preis-Umschalter, Zuordnungszeile, Produktwahl. Reine Darstellung über der bestehenden Engine, kann parallel zu P1 laufen, sobald P0 den Resolver liefert.

Reihenfolge: P0 → P1 und P3 parallel → P2. Vor P0 die Entscheidungen aus Abschnitt 3 (vor allem 3, 5, 7) und 3.1 festziehen.
