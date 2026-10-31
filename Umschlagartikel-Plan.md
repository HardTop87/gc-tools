# Umschlagartikel — Plan und Auswirkungen

Stand 31.10.2026 · Preisbasis 2.6.0 · gemessen mit `computeUmschlagZeile` gegen die Engine über alle Kombinationen.

## Worum es geht

Für die Rückstichheftung mit Umschlag fehlt im Shop noch das Preismodell. Am 11.10. haben wir gemessen, dass das Umschlagpapier als Option (Aufschlag) nicht sauber funktioniert: Entweder bietet der Shop Kombinationen an, die nicht produzierbar sind, oder er verliert mögliche, und die Preise liegen bis zu 147 € daneben. Kombi-Sorten (Inhalt × Umschlag als eine Sorte) hast du wegen der fehlenden Gruppierung im Shop verworfen.

Die damals empfohlene Lösung heißt **Umschlagartikel**: Je Format, Druck des Innenteils und Umschlagpapier gibt es einen eigenen Shop-Artikel. Der Umschlag ist damit fest im Artikel, die Preiszeile ist Inhaltspapier × Auflage, und die restlichen Wahlmöglichkeiten bleiben Optionen.

## Ergebnis der Messung

| | Wert |
|---|---|
| Artikel mit Umschlag | 108 (A4 Hoch 30, A5 Hoch 18, A5 Quer 30, A6 Hoch 30) |
| Artikel ohne Umschlag (unverändert) | 8 |
| RST-Artikel gesamt | 116 (heute 16) |
| Preiszeilen mit Umschlag | 7.720, im Schnitt 3,6 Inhaltspapiere × 20 Staffeln je Artikel |
| bepreiste Zellen mit Umschlag | 147.610 |
| geprüfte Kombinationen | 731.580 (alle Seiten 4–120 × Umschlag 1/1 und 4/4 × Cello) |
| nicht produzierbar, aber angeboten | 0 |
| produzierbar, aber nicht angeboten | 0 |
| zu billig | 0 |
| zu teuer, größte Abweichung | 2,70 € |
| zu teuer um mehr als 5 € | 0 |

Damit ist der Shop-Preis bei jeder Kombination entweder exakt oder höchstens 2,70 € über dem Rechner, nie darunter. Das ist dieselbe Genauigkeit wie bei den Artikeln ohne Umschlag.

## So sieht es für den Kunden aus

1. Der Kunde startet wie heute im sichtbaren Artikel „Rückstichheftung A4 Hoch 4/4 ohne Umschlag".
2. Wählt er „mit Umschlag", springt der Shop in den Umschlagartikel mit dem **Standard-Umschlag** der Papierfamilie seines Inhaltspapiers. Das geht, weil die Weiterleitung je Preiszeile hinterlegt wird, also je Inhaltspapier ein anderes Ziel haben darf.
3. Im Umschlagartikel wechselt das Feld „Papier Umschlag" per Weiterleitung zwischen den Geschwister-Artikeln. Angeboten werden nur Umschlagpapiere, die zum Inhaltspapier passen (Familienregel, Ausnahme R_90 → CC_250 und N_250).
4. Format- und Druckwechsel springen in den Artikel mit demselben Umschlagpapier im anderen Format.

**Bekanntes Risiko:** Laut be.print-Doku übernimmt eine Weiterleitung Menge und Optionen, die **Sorte** ist dort nicht erwähnt. Geht das Inhaltspapier beim Sprung verloren, muss der Kunde es nach jedem Umschlagwechsel neu wählen. Das muss der erste Test klären, bevor wir 100 Artikel anlegen.

## Auswirkungen

**Shop-Backend.** 100 neue Artikel, alle unsichtbar und nur über Weiterleitungen erreichbar. Die Warengruppe zeigt weiter nur die vier Einstiegsartikel. Die Artikelliste im Backend wird lang, Pflege von Hand wird damit praktisch unmöglich und muss über den Import laufen.

**Weiterleitungen.** Rund 26.000 Zellen für den Umschlagpapier-Wechsel, dazu die Format-, Druck- und Umschlag-Schalter. Alles erzeugt der Builder, von Hand ist das nicht machbar.

**Lücke A5 Hoch.** A5 Hoch hat nur 9 statt 15 Umschlagpapiere. Sechs Papiere (CC 200/300/350, N 200/300, R 300) gibt es dort nicht. Wer in A4 mit 300g ColorCopy-Umschlag auf A5 Hoch wechselt, landet beim Standard-Umschlag der Familie. Alternative: Guido prüft, ob A5 Hoch diese Papiere bekommen kann.

**Anlage in zwei Stufen.** Neue Artikel entstehen per Import mit leerer ID, ihre Shop-IDs kennen wir erst nach einem Export. Ablauf: Hüllen importieren, alle exportieren, IDs per Script ins Mapping übernehmen, dann die fertigen Dateien mit Preisen und Weiterleitungen importieren. Der Import nimmt mehrere Dateien oder ein ZIP an, das sind also zwei Uploads, nicht hundert.

**Preisänderungen.** Laufen wie heute über die Verwaltung, danach erzeugt der Builder alle 116 Dateien als ein ZIP. Mehr Artikel bedeuten keinen Mehraufwand pro Änderung, nur eine größere Datei.

**Neues Umschlagpapier in der Verwaltung.** Braucht künftig neue Shop-Artikel (je Format und Druck zwei). Die App muss das erkennen und melden („Artikel fehlt im Shop"), statt still Preise zu verlieren.

**Artikel-Verwaltung aus dem Design.** Wird wichtiger: Mit 116 Artikeln sind flache Shop-Felder je Artikel 2.300 Einzelwerte. Die bereits beschlossene Produkt-Vorlage mit Artikel-Überschreibung ist damit Pflicht, nicht Komfort.

**Route-API für Switch.** Wird einfacher, weil das Umschlagpapier dann in der Artikelnummer steht. Die Route hängt aber weiter von der Seitenzahl ab, die API bleibt also nötig.

**Bestehende 8 mit-Umschlag-Artikel.** Werden nicht gelöscht, sondern zu den Standard-Umschlag-Artikeln ihrer Kombination. Ihre IDs sind schon in den ohne-Umschlag-Artikeln als Sprungziel eingetragen.

## Vorschlag für Namen und Nummern

- Bezeichnung: „Rückstichheftung A4 Hoch 4/4 mit Umschlag 250g ColorCopy"
- Artikelnummer: `BRO-RST-A4H-44-U-CC250`, mit Routen-Tag in der Preiszeile `BRO-RST-A4H-44-U-CC250-GC`

## Ablauf

| Schritt | Wer | Inhalt |
|---|---|---|
| 1. Test | Claude baut, Armin importiert und klickt | Zwei Umschlagartikel A4 Hoch 4/4 (CC 160 und CC 250) als Neuanlage. Prüfen: Sprung aus ohne-Umschlag, Wechsel zwischen den beiden, bleibt die Sorte, bleiben Menge und Seiten, stimmen Preis und Liefertage. |
| 2. Entscheidung | Armin, Guido | Weiter, wenn die Sorte erhalten bleibt oder der Verlust akzeptabel ist. Standard-Umschlag je Familie festlegen. A5-Hoch-Lücke klären. |
| 3. Code | Claude | Mapping für Umschlagartikel aus der Config erzeugen, Writer und Builder für mit-Umschlag, Weiterleitungen, Prüf-Script, Test mit der Messung oben als Dauertest. |
| 4. Anlage | Armin | Hüllen-ZIP importieren, alle RST-Artikel exportieren. |
| 5. IDs | Claude | IDs aus dem Export ins Mapping übernehmen, finales ZIP mit 116 Dateien bauen und prüfen. |
| 6. Import | Armin | Finales ZIP importieren, Stichproben im Shop. |

## Offene Entscheidungen

1. **Standard-Umschlag je Familie** als Sprungziel aus dem Artikel ohne Umschlag. Vorschlag: jeweils 250g (CC 250, N 250, BD 250) und R 300 für Recycling, bei A5 Hoch und R_90 dann CC 250.
2. **A5 Hoch:** fehlende sechs Umschlagpapiere ergänzen oder Lücke lassen.
3. **Namen und Nummern** wie oben vorgeschlagen.

---

## Prüfung des Plans (31.10.2026, auf Armins Bitte „ganz genau")

Die Preisgenauigkeit an den Staffelpunkten hält (siehe oben). Die genaue Prüfung hat aber **drei Befunde** ergeben, von denen zwei nicht nur die Umschlagartikel betreffen, sondern die gesamte RST-Struktur im Shop, also auch die acht Artikel ohne Umschlag, die jetzt importiert werden sollen.

### Befund 1: Zwischen den Staffeln ist der Shop zu billig (seit Preisbasis 2.4.0)

Leadprint rechnet freie Mengen linear zwischen zwei Staffeln. Die Engine ist dort aber nicht linear: Der Dickenaufschlag (ab 80 Ex., bis 7,50 € je Exemplar bei dicken Broschüren) macht die GC-Kurve steil, die Empfehlung kippt zwischen zwei Staffeln zu Kopp oder ILDA, und die Gerade zwischen den beiden Staffelpreisen läuft unter der echten Kurve. Im Juli (2.2.0, ohne Dickenaufschlag) war das noch unkritisch, deshalb wurde es seither nicht neu gemessen.

Gemessen über alle ganzen Mengen 1–1000 (Stichprobe Zeilen, alle Seitenzahlen):

| | ohne Umschlag, heutige 20 Staffeln | mit Umschlag, heutige 20 Staffeln |
|---|---|---|
| Mengen geprüft | 517.587 | 2.509.494 |
| mehr als 5 € zu billig | 2.926 (0,6 %) | 47.397 (1,9 %) |
| größte Abweichung nach unten | −57,33 € | −53,69 € |
| Schwerpunkt | 100–300 Ex., dicke Papiere, viele Seiten | gleich |

Der Großteil der Abweichungen liegt unter 1 €, aber die Ausreißer sind groß, und Zwischenmengen (150, 250 …) sind im Shop der Normalfall.

**Gegenmaßnahme, gemessen:** Staffeln verdichten (33 statt 20, zusätzlich 15, 30, 40, 75, 120–300 in 20er- bzw. 25er-Schritten) **und** eine „Sicherheitshülle": Der Writer rechnet die echte Kurve zwischen zwei Staffeln durch und hebt die Staffelwerte so weit an, dass die Gerade nie unter dem echten Preis liegt.

| | ohne Umschlag | mit Umschlag |
|---|---|---|
| zu billig | 0 | 0 |
| im Schnitt zu teuer | +0,35 € | +0,66 € |
| mehr als 5 € zu teuer | 1,3 % | 1,6 % |
| größte Abweichung nach oben | +31 € | +31 € |

Das ist eine **Entscheidung für Guido**: exakt an den Staffeln und dazwischen in 0,6–1,9 % der Fälle deutlich zu billig, oder nie zu billig und dafür im Schnitt unter einem Euro zu teuer, mit seltenen Ausreißern bis 31 € in der Dickenaufschlag-Zone. Empfehlung: Hülle plus dichte Staffeln, weil zu billige Verkäufe echtes Geld kosten und zu teure nur Nachfrage. Betrifft den **Writer für beide Artikeltypen** und sollte **vor dem Import der acht ohne-Umschlag-Artikel** umgesetzt werden, die Dateien sind dann neu zu bauen.

### Befund 2: Die Sorte (Inhaltspapier) geht bei jeder Weiterleitung wahrscheinlich verloren

Die be.print-Spezifikation SA 8279 zählt auf, was beim Sprung in den Zielartikel übernommen wird: Menge, Seiten/Anzahl (Loseblatt), freie Maße, Zusatzfelder, **Auswahl der dynamischen Optionen**, Versand, Bezahlung. **Die Sorte steht nicht in der Liste.** Das betrifft nicht nur den Umschlagwechsel, sondern schon heute jeden Format- und Farbigkeitswechsel in den 16 bestehenden Artikeln und den Sprung „mit Umschlag".

Folgen für die Umschlagartikel: Wer den Umschlag wechselt, muss das Inhaltspapier vermutlich neu wählen. Erträglich, wenn die Feldreihenfolge im Shop Format → Druck → Umschlag → Inhaltspapier ist, weil dann die Sorte zuletzt gewählt wird. Ob Leadprint die Sorte tatsächlich verwirft oder nur nicht dokumentiert, zeigt allein der Test. Die Shop-Gruppierungen („Kalkulieren – Umschlag") lassen sich dafür sortieren.

Zusätzlich im Test zu klären: Was macht der Shop, wenn eine übernommene Option im Zielartikel keinen Preis hat (Formatwechsel nach A5 Hoch mit einem der sechs dort fehlenden Umschlagpapiere)?

### Befund 3: Rückgängig machen, Sichtbarkeit und Suchmaschinen

- **„Unsichtbar"** heißt laut Wiki nur „Aus Warengruppenliste ausblenden": „Der Artikel bleibt über seine Adresse erreichbar." Suchmaschinen sind nicht ausgeschlossen, eine noindex-Einstellung je Artikel gibt es nicht, und das Wiki nennt die sitemap.xml als Quelle alter Direktlinks. 100 zusätzliche, inhaltlich fast gleiche Artikelseiten könnten also von Google indexiert werden. Vor dem Ausrollen: sitemap.xml des Shops prüfen, ob ausgeblendete Artikel darin stehen, und be.print nach noindex für ausgeblendete Artikel fragen.
- **Löschen** von Artikeln mit Bestellungen ist nicht dokumentiert. Rückweg daher nicht über Löschen, sondern: Status „gesperrt" (Artikel nicht mehr erreichbar) für die neuen Artikel und Weiterleitungen in den Artikeln ohne Umschlag zurück auf die acht bestehenden mit-Umschlag-Artikel biegen. Das ist ein Import, kein Datenverlust. Löschen nur, solange keine Bestellung auf einem neuen Artikel liegt.
- **Test-Artikel** sollten von Anfang an als gesperrt oder in einem Test-Subshop angelegt werden, damit sie weder gekauft noch indexiert werden.

### Geänderte Reihenfolge

| Schritt | Inhalt |
|---|---|
| 0 | Guido entscheidet Befund 1 (Hülle + dichte Staffeln). Writer anpassen, Dauertest aus der Messung, acht ohne-Umschlag-Dateien neu bauen. |
| 1 | Import der acht ohne-Umschlag-Artikel mit dem neuen Stand. Manueller Test: Liefertage, Bindung, Preis-Stichprobe, **bleibt die Sorte beim Format- und Farbwechsel?** |
| 2 | Zwei Umschlagartikel (A4 Hoch 4/4, CC 160 und CC 250) als gesperrte Neuanlage. Test: Sprung aus ohne Umschlag, Umschlagwechsel, Sorte, Menge, Seiten, Preise, Liefertage, sitemap.xml. |
| 3 | Entscheidung über 108 Artikel. Erst danach Hüllen-Import, Export, IDs, finaler Import. |

Nicht geändert: Preisgenauigkeit an den Staffelpunkten, Artikelzahl 116, Anlage in zwei Stufen, Standard-Umschlag je Familie, A5-Hoch-Lücke.

### Befund 4 (Nachtrag, Armins Hinweis): Subshop-Zuweisung steht nicht in der Importdatei

Armin schaltet jeden Artikel von Hand im Subshop frei. Der Export bestätigt das Modell: Alle 16 aktuellen Artikel tragen `global_in_allen_subhops_ausblenden_jn = 1` (die Juli-Exporte noch 0), dazu `unsichtbar = 1` bei den Nicht-Einstiegsartikeln. **Welche Subshops der Artikel freigeschaltet hat, steht in keiner Spalte des Export-/Importformats**, die Doku kennt nur die globale Ausblende-Checkbox. Die Zuweisung lebt allein im Backend, je Artikel, ohne Sammelaktion (Wiki: Mehrfachauswahl kann nur löschen). Ein Artikel mit aktiver Shopzuweisung ohne gewählten Subshop ist laut Shop-Inspektor „in keinem Subshop sichtbar", als Weiterleitungsziel also tot.

Folgen:
- **Jeder neue Umschlagartikel braucht einen Handgriff im Backend** (Artikel öffnen, Subshop anhaken, speichern), bei 100 Artikeln grob zwei Stunden. Ob das Kopieren eines Artikels im Backend die Shopzuweisung mitnimmt, ist nicht dokumentiert. Armin hat am 11.10. vierzehn Artikel kopiert und weiß, ob er sie danach einzeln freischalten musste. Falls Kopieren die Zuweisung mitnimmt, ist „im Backend kopieren, dann Preise per Import" der schnellere Anlageweg als „Import mit leerer ID, dann 100 Freischaltungen".
- **Vor dem Test der zwei Umschlagartikel** müssen beide im Subshop freigeschaltet sein, sonst scheitert die Weiterleitung aus einem Grund, der mit dem Plan nichts zu tun hat.
- Frage an be.print lohnt sich: Kann der Import die Shopzuweisung setzen (undokumentierte Spalte), oder gibt es eine Sammelzuweisung?
- Nebenbefund Sitemap: Seit Druckshop 9.5.0 nimmt „Im Hauptshop ausblenden" den Artikel aus Warengruppenlisten, Produktsuche **und Sitemap** des Hauptshops. Für den Subshop gilt das nicht, dort bleiben ausgeblendete Artikel per URL erreichbar. Nach dem Test die sitemap.xml des Subshops prüfen.

---

## Testanleitung (Stand 31.10.2026)

Sechs Testartikel, alle mit Präfix `TEST-` in Artikelnummer und Bezeichnung, unsichtbar in der Warengruppe, Status OK (ein gesperrter Artikel wäre im Frontend nicht erreichbar). Sie fassen die 16 Live-Artikel nicht an.

| Kürzel | Artikel | Zweck |
|---|---|---|
| T-E | TEST A4 Hoch 4/4 ohne Umschlag | Einstieg; Sprung „mit Umschlag" je Papierfamilie (CC → T-U2, Natur → T-U4) |
| T-U1 | TEST A4 Hoch 4/4 Umschlag 160g ColorCopy | Umschlagwechsel innerhalb der Familie |
| T-U2 | TEST A4 Hoch 4/4 Umschlag 250g ColorCopy | Standard-Umschlag CC, Ziel aus T-E, Formatwechsel nach A5 |
| T-U3 | TEST A4 Hoch 4/4 Umschlag 350g ColorCopy | dickster Umschlag, Seitenlimit, Dickenaufschlag |
| T-U4 | TEST A4 Hoch 4/4 Umschlag 250g Natur | Familienwechsel: andere Inhaltspapiere sichtbar? |
| T-U5 | TEST A5 Hoch 4/4 Umschlag 250g ColorCopy | Formatwechsel-Ziel |

### Stufe 1: Anlegen

1. ZIP `Leadprint_Import/test-umschlag-stufe1-<datum>.zip` im Backend importieren (Artikel-Import, ZIP-Upload). Spalte A ist leer, der Shop legt sechs neue Artikel an.
2. Report des Imports prüfen: sechs Artikel angelegt, keine Fehler.
3. Jeden der sechs Artikel öffnen und **im Subshop freischalten** (Shopzuweisung). Ohne diesen Schritt sind sie im Frontend unsichtbar und jede Weiterleitung läuft ins Leere.
4. Alle sechs exportieren (Mehrfachauswahl, ZIP) und die Export-Dateien nach `Leadprint_Export/` legen. Daraus übernehme ich die IDs ins Mapping und baue Stufe 2.

Dabei beantwortet sich nebenbei: Legt der Import mit leerer ID einen vollständigen Artikel an (Optionsfelder zugeordnet, Sorten, Flags)? Und musst du die Shopzuweisung je Artikel von Hand setzen oder ist sie vorbelegt?

### Stufe 2: Weiterleitungen

5. Zweites ZIP importieren (Spalte A jetzt mit IDs, überschreibt die sechs Artikel, setzt die Weiterleitungen).
6. Export der sechs zur Kontrolle, ich vergleiche zellgenau gegen den Import.

### Durchklicken im Frontend (Subshop, per Direktlink auf T-E)

| Nr. | Schritt | Erwartung | Entscheidend für |
|---|---|---|---|
| 1 | T-E öffnen, Inhaltspapier 120g ColorCopy, 100 Ex., 24 Seiten wählen | Preis wie Rechner (ohne 3 % Grundaufschlag vergleichen) | Baseline |
| 2 | „mit Umschlag" wählen | Sprung nach T-U2 (250g ColorCopy) | Familien-Standard |
| 3 | Nach dem Sprung prüfen: Menge 100? Seiten 24? **Inhaltspapier noch 120g ColorCopy?** | Menge und Seiten ja (dokumentiert). Inhaltspapier ist die offene Frage | **Befund 2** |
| 4 | Angebotene Inhaltspapiere in T-U2 ansehen | nur ColorCopy 100/120/160 | Familienregel |
| 5 | Umschlagpapier auf 160g wechseln | Sprung nach T-U1, Menge/Seiten erhalten, Inhaltspapier? | Befund 2 |
| 6 | Umschlagpapier auf 350g wechseln | Sprung nach T-U3; bei 160g Inhalt sind hohe Seitenzahlen ausgeblendet | Seitenlimit |
| 7 | In T-U3: Umschlag 4/4 und Cello matt wählen | Preis = Rechner-Preis derselben Konfiguration | Aufschläge |
| 8 | In T-U2: Umschlagpapier auf 250g Natur | Sprung nach T-U4; Inhaltspapiere jetzt Natur 80–120 | Familienwechsel |
| 9 | In T-U2: Endformat A5 Hoch | Sprung nach T-U5, Umschlag 250g ColorCopy vorbelegt, Menge/Seiten erhalten | Formatwechsel |
| 10 | In T-U5: Endformat zurück auf A4 Hoch | Sprung nach T-U2 | Rückweg |
| 11 | In T-U2: „ohne Umschlag" wählen | Sprung nach T-E | Rückweg |
| 12 | Zwischenmenge 150 Ex. in T-U3 mit 160g Inhalt, 48 Seiten | Preis notieren und mit Rechner vergleichen (Erwartung: Shop günstiger, Befund 1) | Entscheidung Hülle |
| 13 | Liefertermin bei 100 Ex. 24 Seiten vs. 100 Ex. 64 Seiten in T-U2 | zweiter Fall einen Tag länger (ILDA-Zeile) | U1 Liefertage |
| 14 | `https://<subshop>/sitemap.xml` öffnen | stehen die TEST-Artikel darin? | Befund 3 |

Rückweg nach dem Test: die sechs TEST-Artikel auf Status GESPERRT setzen oder löschen (keine Bestellungen vorhanden).

---

## Staffelsuche (31.10.2026, Nachtrag zu Befund 1)

Armins Vorgabe: Staffeln kosten im Export nichts außer Zeilen, also so viele wie nötig. Gemessen über 3.887 Preiskurven (ohne und mit Umschlag, alle ganzen Mengen 1–1000, Stichprobe der Zeilen).

**Warum es keine exakte Lösung mit wenigen Staffeln gibt:** Die Engine wechselt je Papier und Seitenzahl an einer anderen Menge die Route (GC → Kopp → ILDA), dazu Knicke beim Dickenaufschlag (80 Ex.) und an den Verarbeitungsstaffeln der Partner (300, 400 …). Jede Kurve hat ihre eigenen Knickstellen zwischen 80 und 500. Eine gezielte Suche nach den „schlimmsten" Mengen bringt deshalb wenig; ein regelmäßiges Raster ist genauso gut und für alle nachvollziehbar.

| Raster | Staffeln | Zeilen je Artikel ohne U / mit U | ohne U + Hülle: > 5 € zu teuer · Ø Fehler | mit U + Hülle: > 5 € zu teuer · Ø Fehler |
|---|---|---|---|---|
| heute | 20 | 260 / 72 | 2,15 % · 0,59 € | 3,32 % · 1,08 € |
| A: + 80–300 je 5, 320–500 je 20, 550–1000 je 50 | 75 | 975 / 270 | 0,11 % · 0,14 € | 0,19 % · 0,35 € |
| **B: + 80–300 je 2, 310–500 je 10, 550–1000 je 50** | **151** | **1.963 / 544** | **0,04 % · 0,12 €** | **0,07 % · 0,30 €** |
| C: + 80–300 je 1, 305–500 je 5, 525–1000 je 25 | 290 | 3.770 / 1.044 | 0,01 % · 0,13 € | 0,03 % · 0,30 € |
| D: jede Menge bis 500, dann je 10 | 551 | 7.163 / 1.984 | 0 % · 0,10 €, max +0,61 € | 0 % · 0,21 €, max +1,85 € |

„Hülle" = Staffelwerte so angehoben, dass die Gerade nie unter dem echten Preis liegt (nie zu billig). Ohne Hülle bleiben in jedem Raster außer D einzelne Mengen 8 bis 26 € zu billig.

**Empfehlung: Raster B mit Hülle.** Nie zu billig, im Schnitt 18 bis 33 Cent zu teuer, 99,7 bis 99,8 % der Mengen innerhalb von 5 € (volle Messung über alle 29 Seitenzahlen am 31.10.: ohne U 0,195 % > 5 €, Ø +0,18 €; mit U 0,25 %, Ø +0,33 €; die Tabelle oben wurde mit 13 Seitenzahlen gemessen). Die verbleibenden Ausreißer (bis +28 €) sitzen fast alle bei 300–310 Exemplaren mit Umschlag (Verarbeitungsstaffel Kopp bei 300) und lassen sich durch 2er-Schritte bis 320 weiter drücken. Datei je Artikel ohne Umschlag etwa 3,3 MB statt 450 KB.

Raster D wäre praktisch exakt, bedeutet aber 7.000 Preiszeilen je Artikel und 12 MB je Datei. Ob der Shop das verträgt (Preistabelle, Import-Dauer von heute rund 5 Minuten je Datei), müsste be.print beantworten. Vorschlag: mit B starten, am Testartikel prüfen, ob die Import-Dauer mit der Zeilenzahl wächst, und D als Option behalten.

**Import-Dauer (Armins Screenshot 31.10.):** Der Shop arbeitet die Importdateien einzeln ab, Abstand etwa 5 Minuten. 116 Artikel sind rund 10 Stunden Warteschlange, planbar über Nacht, aber kein „kurz einspielen".

**Entscheidung Armin 31.10.2026: Raster B mit Hülle wird getestet, Stufe 2 der Testartikel läuft bereits damit. Umgesetzt am 31.10. (Mapping 151 Staffeln, Hülle im Mapper, Builder behält `articlePrices.id` der vorhandenen Zeilen und hängt neue ohne id an; Live-Datei A4H 4/4: 1.963 Zeilen, 260 mit id, 3,0 MB; Build 0,5–0,8 s je Artikel). Nebenbefund: Die A5-Hoch-Exporte vom 11.10. enthalten noch 3 A4-Sorten (60 Zeilen), die der Import entfernt.**

Umsetzung: Staffeln in `leadprintMapping.rst.json` (`auflagen`) erweitern, Hülle im Mapper/Writer für beide Artikeltypen, Dauertest aus der Messung. Danach alle Dateien neu bauen, auch die sechs Testartikel und die acht ohne Umschlag.

**Nachtrag Shopzuweisung (Screenshot Armin, 31.10.):** Die Backend-Maske hat drei Elemente: Checkbox „Im Hauptshop ausblenden", Checkbox „Shopzuweisung aktivieren" (bei den Live-Artikeln an) und die Liste „Artikel in folgenden Shops anzeigen" (gc_subshop). Im Export entspricht die zweite Checkbox dem Feld `global_in_allen_subhops_ausblenden_jn` (1 bei allen 16 Live-Artikeln, 0 bei den Juli-Exporten vor der Zuweisung). Die Shop-Liste hat keine Export-Spalte; `shop__id` steht bei allen Artikeln auf 0 und ist es nicht. **Prüfauftrag für Stufe 2:** Die Exporte der sechs Testartikel (nach Armins Freischaltung in gc_subshop) zellgenau gegen die Stufe-1-Importdateien vergleichen; jede Spalte, die sich außer id/Datum geändert hat, ist ein Kandidat für die Zuweisung. Erwartung: keine, dann bleibt es beim Handgriff je Artikel oder einer Rückfrage bei be.print nach einer undokumentierten Importspalte.
