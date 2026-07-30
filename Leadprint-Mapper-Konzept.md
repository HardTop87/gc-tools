# Leadprint-Mapper — Analyse & Konzept (Stand 2026-07-30)

> Zahlen auf Preisstand `pricingConfig` **2.2.0** (V3-Update vom 30.07.2026).

> **Ziel:** Aus der `pricingConfig`-JSON des RST-Rechners (Verwaltung → Export, siehe
> `RST-Rechner-Update-Spec.md` Kap. 8.3) automatisiert Import-Dateien für das
> Leadprint-Backend erzeugen — im selben Format wie die vier Beispiel-Exporte in
> `Leadprint_Export/`. Zusätzlich: ein Produktionsweg-Nachweis für Guido
> (GC/Horizon, Kopp oder ILDA) pro Konfiguration.
>
> Alle Preise EUR netto. Analysierte Dateien: `export_1112051233/1356/1377/1509_BRO_RST.xlsx`.

---

## 1. Analyse der Beispiel-Exporte

### 1.1 Artikelstruktur: eine Datei = ein Artikel, Matrix über Verweise

Die vier Dateien bilden die Matrix **Format × Farbigkeit** ab, jede Kombination ist ein
eigener Leadprint-Artikel (alle mit `artikelnummer` „BRO-RST"):

| Leadprint-Artikel-ID | Bezeichnung |
|---|---|
| 1112051233 | Rückstichheftung - A4 1/1 |
| 1112051356 | Rückstichheftung - A4 4/4 |
| 1112051377 | Rückstichheftung - A5 1/1 |
| 1112051509 | Rückstichheftung - A5 4/4 |

Die Artikel sind über `…rai`-Spalten („related article id") in den Preiszeilen
**kreuzverlinkt**: Wählt der Kunde im Shop ein anderes Format oder eine andere
Farbigkeit, springt Leadprint auf den jeweiligen Schwester-Artikel. Verifiziert:

- Gruppe **5470 = Format**: Option `15657` = A4, `15658` = A5. Im A4-1/1-Artikel zeigt
  `5470.15658.rai` auf 1112051377 (A5 1/1) — gleiche Farbigkeit, anderes Format.
- Gruppe **5510 = Farbigkeit**: Option `15831` = 1/1, `15833` = 4/4. Im A4-1/1-Artikel
  zeigt `5510.15833.rai` auf 1112051356 (A4 4/4).

### 1.2 Dateiaufbau: Blockstruktur in einem Worksheet

Ein Worksheet („Worksheet", ~360 Zeilen), sequenzielle Blöcke aus je einer
Header-Zeile (`prefix.feldname`) + Datenzeile(n) + Leerzeile:

| Block | Inhalt |
|---|---|
| `article.*` (213 Spalten) | Stammdaten: Bezeichnung, Artikelnummer, Beschreibung, Infotext (HTML), `produktionszeit` (3), `warengruppe__id` (26307), Versand-/Datenprüfungs-Flags etc. |
| `article_settings.*`, `article_settings_two.*` | Berechnungs-Flags, SEO-Beschreibungsfelder (hier leer) |
| `article_dynopt_au.*` (30 Gruppen) | **au = auflagenunabhängige** Optionsfelder (ein fester Preis pro Option). Aktiv (erste Zelle = 1): **5463** (Optionen 0 / 15 €), **5515** (0 / 0), **5516** (0 / 10 / 25 %) |
| `article_dynopt_aa.*` (58 Gruppen) | **aa = auflagenabhängige** Optionsfelder (Preis je Preiszeile/Auflagenstaffel). Aktiv: **5470** (Format), **5510** (Farbigkeit), **5561** (ohne Werte), **5563** (Seitenanzahl) |
| `articleGlobalVariety.*` (66 Spalten) | **Papier-Freischaltung**: eine Spalte pro global angelegter Papiersorte, Wert 1 = für diesen Artikel wählbar. In allen vier Dateien identisch 12 Papiere aktiv: 1933–1936, 1942, 1943, 1961–1963, 1970–1972 |
| `articlePrices.*` (134 Spalten × 84 Zeilen) | **Die Preismatrix** (siehe 1.3) |

### 1.3 Preismodell

Eine Preiszeile pro **Papier × Auflagenstaffel**: 12 Papiere × 7 Staffeln
(1, 10, 25, 50, 100, 200, 250 Stück) = 84 Zeilen. Pro Zeile:

- `bezeichnung`/`wert`: Staffel („100 Stück" / 100), `paper__id`: Papier-ID (↔ `articleGlobalVariety`)
- `preis`: **Basispreis** der Staffel (in den Beispieldaten für alle Papiere identisch: 10 / 23 / 36 / 47,50 / 65 / 100 / 117,50 € — offenbar Platzhalter)
- `dynopt_aa.5563.<optionId>`: **Seitenzahl-Aufschlag** pro Seitenoption — 30 Spalten
  (Option 16136 … 16426), Werte steigen linear und unterscheiden sich je Artikel
  (bei „1 Stück", erste Option: A4 4/4 = 1,006 | A4 1/1 = 0,396 | A5 4/4 = 0,682 | A5 1/1 = 0,262)
- `dynopt_aa.5470/5510.<optionId>.rai`: die Kreuzverlinkung aus 1.1

**Preislogik im Shop (Annahme, zu verifizieren):** Endpreis = `preis` (Basis der
Staffel) **+** Aufschlag der gewählten Seitenoption (+ ggf. au-Optionen). Zwischen den
Staffeln interpoliert bzw. staffelt Leadprint selbst — Regel klären.

**Wichtig:** Der Export enthält **nur IDs, keine Klarnamen** für Optionsgruppen,
Optionen und Papiere. Die Zuordnung (welche Options-ID = „8 Seiten", welche
`paper__id` = „CC 120") muss einmalig aus dem Leadprint-Backend abgelesen und als
Mapping-Tabelle gepflegt werden (→ Kap. 3.2).

---

## 2. Ziel-Artikelstruktur für den Shop

Nach heutigem Rechner-Stand (pricingConfig 2.2.0) wäre die Vollmatrix:

| | 1/1 | 4/4 |
|---|---|---|
| A4 Hoch | ✓ (existiert) | ✓ (existiert) |
| A5 Hoch | ✓ (existiert) | ✓ (existiert) |
| A5 Quer | neu | neu |
| A6 Hoch | neu | neu |
| A4 Quer (Banner) | neu | neu |
| 30 × 30 (Banner) | neu | neu |

→ bis zu **12 Artikel**. Pro Artikel:

- **Papiere**: formatabhängige Inhaltspapier-Liste aus der Config (A4H/A5Q/A6H: 13,
  A5H: 11, Banner: 5 Papiere). Achtung: Die Beispiel-Artikel haben 12 Papiere aktiv —
  Abgleich nötig, welches Papier in Leadprint fehlt bzw. zu viel ist (vermutlich
  N_160-Altbestand oder fehlendes R-Papier).
- **Seitenoptionen** (Gruppe 5563): 30 Optionen vorhanden. Sinnvoller Umfang laut
  Rechner: 8–120 Seiten in 4er-Schritten (29 Werte); GC endet bei 48 (ohne U.) /
  44 (mit U.), Kopp bei 120, ILDA bei 100 Seiten.
- **Auflagenstaffeln**: aktuell 1–250. Vorschlag: 1, 2, 3, 5, 10, 25, 50, 100, 200,
  300, 400, 500 (= Stützstellen der WV-Tabellen; >500 nur wenn der Shop Kopp-Mengen
  bis 1000 anbieten soll — dann zusätzlich 750, 1000).
- **Offene Modellierungsfrage Umschlag/Cello**: In den Beispiel-Artikeln ist kein
  Umschlag abgebildet (Gruppe 5561 ist aktiv, aber ohne Preise — möglicherweise dafür
  vorgesehen). Der Rechner kennt Umschlagpapier (formatabhängig, Familienregel!) und
  Cellophanierung (glänzend/matt/softtouch, nur CC/BD). Ob das in Leadprint als
  weitere dynopt-Gruppen, als separate Artikel („mit Umschlag") oder gar nicht
  abgebildet wird, ist **die zentrale Design-Entscheidung** — die Familienregel und
  seitenabhängige Dickenlimits lassen sich mit flachen Optionsaufschlägen nicht
  exakt abbilden (siehe 3.4).

---

## 3. Mapping-Konzept: pricingConfig → Leadprint-Import

### 3.1 Architektur

Neues Modul im gc-tools-Projekt (z. B. `src/utils/leadprintMapper.js` + Seite/CLI):

```
pricingConfig.json  ─┐
                     ├─►  Mapper  ─►  je Ziel-Artikel eine Import-XLSX (Format wie Export)
leadprintMapping.json┘         └─►  Produktionsweg-Matrix für Guido (Kap. 4)
```

Der Mapper nutzt die **vorhandene Engine** (`calculateRSTPrice.js`) — es wird keine
Preislogik dupliziert. Vorgehen: Beispiel-Export als Vorlage einlesen, nur die
variablen Blöcke (Preise, Papier-Freischaltung, Stammdaten) ersetzen, alles andere
byte-gleich übernehmen. Das minimiert das Risiko, dass Leadprint den Import ablehnt.

### 3.2 Mapping-Tabelle `leadprintMapping.json` (einmalig pflegen)

```json
{
  "artikel": { "A4_Hoch|4c": 1112051356, "A4_Hoch|1c": 1112051233, "…": "…" },
  "formatOptionen":    { "A4_Hoch": 15657, "A5_Hoch": 15658 },
  "farbOptionen":      { "1c": 15831, "4c": 15833 },
  "seitenOptionen":    { "8": 16136, "12": 16137, "…": "…" },
  "papiere":           { "CC_120": 1933, "N_80": 1934, "…": "…" },
  "auOptionen":        { "5463": "Korrekturabzug?", "5516": "…" }
}
```

Quelle: Leadprint-Backend (Optionsverwaltung + Papierverwaltung). Ohne diese Tabelle
kein Import — **erster Arbeitsschritt** und Guido-Termin wert. Die Seitenoptions-IDs
lassen sich zur Kontrolle gegen die linear steigenden Aufschläge plausibilisieren.

### 3.3 Preisberechnung pro Zelle

Für jeden Ziel-Artikel (Format F, Farbigkeit D), jedes freigeschaltete Inhaltspapier P,
jede Auflagenstaffel A und jede Seitenoption S:

```
1. Engine rechnet alle Routen:  calculateRSTPrice(F, A, S, P, D, ohne Umschlag, Standard)
2. Empfehlungslogik wählt die Route (GC ≤ Partner+20 → GC; Kopp ≤ ILDA+30 → Kopp; sonst ILDA)
3. Zellpreis  = gesamt(empfohlene Route)     ← Verkaufspreis netto, DB steckt in der Engine
4. Zellroute  = Name der Route               ← geht in die Produktionsweg-Matrix (Kap. 4)
```

Ablage in der Leadprint-Matrix:

- `articlePrices.preis` (Basispreis der Zeile P×A) = Preis der **kleinsten Seitenoption** (8 Seiten)
- `dynopt_aa.5563.<S>` = `preis(S) − preis(8 Seiten)` (Aufschlag, additiv — Annahme aus 1.3, vor dem ersten Import mit einem Testartikel verifizieren!)
- Kombination ungültig (Seitenlimit/Dicke überschritten, keine Route liefert einen
  Preis): Zelle leer lassen — Verhalten von Leadprint bei leeren Options-Zellen klären
  (blendet es die Option aus oder zeigt es 0 €?). Fallback: Option gar nicht befüllen
  und `seitenOptionen`-Umfang pro Artikel/Papier begrenzen.
- `produktionszeit` = 3 WT nur korrekt, solange keine ILDA-Zelle enthalten ist (ILDA = 4 WT).
  Enthält ein Artikel ILDA-Preise → 4 eintragen oder Artikel auf GC/Kopp-Bereich beschränken.
- Express (+10 %) wäre eine au-Option mit prozentualem Aufschlag — ob Leadprint
  prozentuale au-Aufschläge kann, klären; sonst weglassen (Express nur auf Anfrage).

### 3.4 Bewusste Vereinfachung gegenüber dem Rechner

Die Leadprint-Matrix ist **flach** (Basis + additive Aufschläge), der Rechner ist es
nicht (Makulatur-/DB-Formeln sind nichtlinear, Route kippt je nach Kombination).
Der Mapper rechnet deshalb jede Zelle **exakt** — aber zwischen den Staffeln
interpoliert der Shop, und Umschlag/Cello sind (Stand heute) nicht pro Kombination
abbildbar. Konsequenz-Empfehlung für Phase 1:

1. **Inhalt-only-Artikel** (wie die Beispiele): exakt abbildbar ✓
2. Umschlag: falls gewünscht, als **eigene Artikel-Variante** („mit Umschlag CC 300,
   cellophaniert matt" als Paket) statt freier Papier-/Cello-Kombinatorik — jede
   Paket-Variante ist dann wieder exakt rechenbar.
3. Freie Umschlag-Kombinatorik im Shop nur, wenn Leadprint verschachtelte
   Optionspreise (Aufschlag abhängig von Papier × Seiten × Auflage) unterstützt → mit
   Leadprint-Support klären.

---

## 4. Produktionsweg-Hinweis für Guido (intern/GC, Kopp, ILDA)

Der Produktionsweg steckt **nicht** im Leadprint-Artikel — er variiert pro Zelle
(Auflage × Seiten × Papier). Zwei Bausteine:

### 4.1 Faustregeln (aus Empfehlungslogik + Referenzrechnungen)

| Situation | Weg |
|---|---|
| A4/A5/A6, 1–500 Ex., ≤ 48 S. ohne U. / ≤ 44 S. mit U., Dicke ≤ 1,5 mm | **GC (Horizon)** — gewinnt innerhalb seiner Limits praktisch immer (Delta-Regel +20 €) |
| Standardformate außerhalb GC-Limits (mehr Seiten, dicker, > 500 Ex.) | **Kopp** (bevorzugt bis +30 € ggü. ILDA; ab 10 Ex., bis 120 S., bis 1000 Ex.) |
| Kopp nicht möglich/deutlich teurer, Auflage 100–500 | **ILDA** (Standardformate ab 100 **bis 500** Ex., bis 100 S.) |
| Banner (A4 Quer, 30 × 30) | **immer ILDA** (einziger Weg; ab 10 Ex.) |
| A6 Hoch | nur GC oder Kopp (ILDA kann A6 nicht) |

### 4.2 Produktionsweg-Matrix (generiert, empfohlen)

Der Mapper schreibt beim Erzeugen der Import-Dateien zusätzlich eine
**`Produktionswege-<datum>.xlsx`**: pro Artikel ein Blatt, Zeilen = Auflagenstaffeln,
Spalten = Seitenzahlen, Zellwert = `GC` / `KOPP` / `ILDA` (+ Markierung, wenn der
zweitbeste Weg < 10 € entfernt ist — dort lohnt ein Blick im Einzelfall). Da die
Zellen ohnehin berechnet werden, fällt die Matrix als Nebenprodukt ab.

Zusätzlich für den Bestellalltag: Der **RST-Rechner selbst** bleibt Guidos
Nachschlagewerk — Konfiguration der Bestellung eingeben → Empfehlung inkl.
Preisvergleich aller drei Wege. Optional können wir die Faustregel-Tabelle (4.1) in
das interne Zusatz-Infofeld des Leadprint-Artikels (`article.zus_infofeld`) legen,
sofern das Feld nicht kundensichtbar ist (klären).

---

## 5. Offene Punkte (vor Umsetzung klären)

| # | Punkt | Mit wem |
|---|---|---|
| 1 | Klarnamen/IDs: Optionsgruppen (5561!, 5463, 5515, 5516), Seitenoptions-IDs, Papier-IDs → `leadprintMapping.json` | Guido / Leadprint-Backend |
| 2 | Preislogik: Aufschläge additiv zur Zeilenbasis? Interpolation zwischen Staffeln? Verhalten leerer Options-Zellen? | Leadprint-Support / Testartikel |
| 3 | ~~Import-Weg~~ **Geklärt (Doku, 07.07.):** Export-XLSX ist re-importierbar. Spalte A/Zeile 2 (article.id): gleiche ID = Artikel überschreiben, **leer = neuen Artikel anlegen**, fremde ID = diesen Artikel aktualisieren. Neue Preiszeilen: Spalte A leer lassen (ID wird generiert). Optionen/Sorten müssen vor dem Import existieren. | — |
| 4 | Umschlag & Cello im Shop: Paket-Varianten (Empfehlung) oder freie Kombinatorik? | Armin + Guido |
| 5 | Auflagenobergrenze im Shop (250 wie bisher, 500, oder Kopp-1000?) und Staffelraster | Guido |
| 6 | Neue Artikel für A5 Quer, A6, Banner anlegen (IDs entstehen erst in Leadprint) — Reihenfolge: erst anlegen, dann exportieren, dann mappen | Guido |
| 7 | `zus_infofeld` kundensichtbar? (für Produktionsweg-Hinweis am Artikel) | Leadprint-Support |
| 8 | ~~Platzhalterpreise R_90 / N_100_BAN~~ **erledigt (30.07.):** R_90 = 41,20 € final; N_100_BAN entfällt (nicht lieferbar), ersetzt durch N_80_BAN (60 €) und N_120_BAN (90 €) | — |

## 6. Beschlossenes Vorgehen (Update 07.07.2026)

Nach Klärung mit Armin:

- **Bestätigt:** Leadprint blendet Optionen ohne Preis in der Zelle aus → die
  Familienregel (Umschlag ↔ Inhalt) wird durchgesetzt, indem der Mapper
  Umschlag-Optionen nur in Zeilen der passenden Papierfamilie bepreist. Punkt 2/7
  aus Kap. 5 damit teilweise erledigt.
- **Zielstruktur: 16 Artikel** — 4 Formate (A4H, A5H, A5Q, A6H) × 2 Farbigkeiten ×
  (ohne | mit Umschlag). „Mit Umschlag" als eigene Artikel, weil das GC-Seitenlimit
  mit Umschlag (44 statt 48) und der Routenwechsel sonst nicht pro Option abbildbar
  sind. Umschlagpapier und Cellophanierung werden in den mit-U-Artikeln eigene
  Optionsgruppen (Aufschläge exakt: nur auflagen-, nicht seitenabhängig).
  Kreuzverlinkung (Format/Farbigkeit/Umschlag) über `.rai` generiert der Mapper.
- **Banner (A4 Quer, 30×30) verschoben** auf eine spätere Phase.
- **Partner von Anfang an dabei**: Seiten 8–120 (29 Optionen, deckt Gruppe 5563 exakt
  ab; Option 52314 ist unbepreist → Bedeutung klären), Auflagenstaffeln auf
  WV-Stützstellen (1–500; 600–1000 nur Kopp → Guido-Entscheid, siehe Vorlage).
- **Mapping-Erfassung:** `Leadprint-Mapping-Vorlage.xlsx` (Repo-Root, generiert aus
  Config + Export-Analyse) wird von Guido/Armin im Leadprint-Backend befüllt und ist
  danach die Quelle für `leadprintMapping.json`.
- **Bekannte Näherung:** In mit-U-Artikeln hängt das Seitenlimit vom gewählten
  Umschlagpapier ab; leere Zellen können aber nur pro Zeile×Seitenoption gesetzt
  werden, nicht pro Umschlag-Wahl. Lösung: Seitenoptionen pro Artikel am dicksten
  zugelassenen Umschlag deckeln oder schwere Umschläge (>300 g) weglassen — mit
  Guido zu entscheiden.

### 6.1 Geprüfte Alternative: Ein-Artikel-Modell (export_1112051230, 07.07.)

Zusätzlich analysiert: Artikel 1112051230 „Rückstichheftung A4 Hochformat" — ein
andersartiger (unfertiger) Modellierungsansatz: **ein** Artikel pro Format, Preiszeilen =
einzelne Auflagen („1/2/3 Exemplare"), und *alles andere* (vermutlich Seiten 1/1 und 4/4
getrennt als Gruppen 5555/5628, Umschlag/Cello als 5561/5562, u. a.) als Optionsgruppen
mit handgepflegten Aufschlägen pro Auflagenzeile. Erkenntnisse daraus: Aufschläge können
**negativ** sein (5562: −20 €), es gibt eine `bp`-Spalte (Options-Basispreis?), und
Auflagen können beliebig fein als Zeilen angelegt werden.

**Bewertung: für unser Preismodell ungeeignet.** Aufschläge variieren nur pro Preiszeile
(= Auflage), nicht pro Wahl einer anderen Option. Papier ist hier aber eine Option statt
Zeilenachse → die Interaktionen Papier×Seiten (Papierkosten wachsen mit jedem Bogen) und
Papier×Route (Dickenlimit entscheidet, ob GC oder Kopp den Verarbeitungspreis stellt)
sind nicht abbildbar; ebenso Farbigkeit×Seiten. Das Matrix-Modell (Kap. 6) hält Papier
auf der Zeilenachse und bleibt damit exakt. Übernehmenswert: feineres Auflagenraster
(kleine Staffeln 1–5 einzeln) und ggf. negative Aufschläge für „ohne"-Optionen.
**Options-Preismechanik (geklärt durch Guido, 07.07.):** `pt` = Price Type;
`dpm` = Different price manipulation, **nur für Loseblatt-Artikel** (0 = keine,
1 = keine Multiplikation, 2 = × Auflage, 3 = × Seiten, 4 = × Auflage × Seiten);
`bp` = Basispreis der Optionsgruppe (Muster: Veredelung Umschlag — Grundkosten in
`bp`, Option „ohne" mit negativem Aufschlag zum Aufheben). Konsequenzen:

- Die multiplikative Optionspreis-Mechanik (dpm) steht unseren Broschüren-Artikeln
  (kein Loseblatt-Typ) nicht zur Verfügung — und selbst als Loseblatt-Artikel könnte
  eine lineare Seiten-Multiplikation die WV-Sprünge beim Routenwechsel nicht abbilden.
  **Das Matrix-Modell ist damit endgültig bestätigt.**
- Das `bp`/„ohne = −bp"-Muster ist exakt unsere Cellophanierung: `bp` = 20 €
  Grundkosten, „ohne" = −20 €, Stückaufschläge pro Zeile vom Mapper. Gruppe 5562 aus
  Artikel 1112051230 ist sehr wahrscheinlich genau diese Gruppe („Veredelung
  Umschlag") → wiederverwenden statt neu anlegen.
- `pt`: 0 = Wert (€), 1 = Prozent (geklärt 07.07.). Gruppe 5516 (pt = 1, Optionen
  0/10/25) arbeitet also prozentual → der **Express-Zuschlag (+10 %) ist als
  Auftrags-Option abbildbar**, sehr wahrscheinlich über genau diese Gruppe
  (Benennung + Bedeutung der 25-%-Option mit Guido klären). Damit entfällt die
  Einschränkung aus Kap. 3.3 („Express weglassen"); Achtung: Leadprint rechnet den
  Prozentsatz vermutlich auf die Auftragssumme inkl. aller Optionen — Verhalten im
  Testartikel gegen die Engine prüfen (dort gilt +10 % auf alles außer Versand).

### 6.2 UI-Muster für den Umschlag-Umschalter (bestätigt am Shop-Frontend, 07.07.)

Das Shop-Frontend des Test-Artikels 1112051230 zeigt das Zielbild und benennt die
Gruppen: Endformat, Bindung | Seitenanzahl/Farbigkeit/Papier Innenteil |
Seitenanzahl/Farbigkeit/Papier Umschlag | Veredelung Umschlag, SquareFold.

Beschlossen (Armin): Die Gruppe **„Seitenanzahl Umschlag"** (Optionen „ohne
Umschlag" / „4 Seiten", vermutlich Gruppe 5629) ist der **rai-Umschalter** zwischen
den ohne-U- und mit-U-Artikeln — Standard im ohne-U-Artikel ist „ohne Umschlag";
wählt der Kunde „4 Seiten", springt der Shop zum mit-U-Zwilling. Die
Umschalter-Optionen selbst bleiben unbepreist (die Preisdifferenz steckt komplett in
der Matrix des Zielartikels), genau wie beim Format-/Farbigkeitswechsel. Erst im
mit-U-Artikel sind Papier Umschlag (vermutlich 5561, Optionen ggf. auf bis zu 15
Papiere erweitern), **Farbigkeit Umschlag** (vermutlich 5559; Aufschlag 4/4 vs. 1/1
ist nur auflagenabhängig → exakt pro Zeile berechenbar) und Veredelung (5562)
bepreist — im ohne-U-Artikel bleiben sie leer und damit unsichtbar.
Neue Gruppen müssen damit voraussichtlich gar nicht angelegt werden. SquareFold
bleibt unbepreist (nicht im Rechner). Im Testartikel prüfen: Übernimmt der
rai-Sprung die bereits gewählten Werte (Auflage, Papier, Seitenzahl)?

### 6.3 Backend-Struktur entschlüsselt — Optionsfelder-Modell (Druckshop 9.2.2, 07.07.)

Backend-Screenshots (Einstellungen → Dynamische Optionsfelder) klären das Datenmodell
endgültig; **das Options-Mapping wurde darauf umgebaut** (Vorlage Rev. 2):

- **Optionstyp**: jedes Feld ist *auflagenabhängig* (Preis je Auflagenstaffel →
  Export-Präfix `dynopt_aa`) oder *auflagenunabhängig* (ein Preis → `dynopt_au`).
  Der Mapper unterscheidet die zwei Typen im Datenmodell explizit.
- **IDs zweistufig**: Optionsfeld (Gruppen-ID) + eigene ID je Listenwert. Beide
  erfasst das neue Blatt „Optionsfelder" der Vorlage (eine Zeile pro Listenwert).
- **Feld-Einstellungen** (pro Optionsfeld, nicht pro Artikel): „Weiterleitung" =
  rai-Mechanik (für Endformat, Farbigkeit Innenteil, Seitenanzahl Umschlag —
  dort bestätigt aktiv), „Grundpreis" = bp-Mechanik (für Veredelung: 20 €
  Grundkosten), „Gruppierungen" = Frontend-Abschnitt (z. B. „Kalkulieren -
  Umschlag"), Produktionszeit-Verhalten sowie „Liefertage" je Listenwert
  (relevant für Produktionsgeschwindigkeit), Rückenstärkenberechnung.
- **Die RST-Optionsfelder existieren bereits** (interne Bezeichnung „… RST",
  Sortierung 300 Seitenanzahl Umschlag / 311 Farbigkeit Umschlag / 312 Papier
  Umschlag / 333 Veredelung Umschlag). Die Kandidaten-Zuordnung zu den alten
  Gruppen-IDs des Test-Artikels 1230 (Kap. 6.2) ist damit für die Ziel-Artikel
  **obsolet** — es gelten die neuen RST-Felder, deren IDs über die Vorlage erfasst
  werden.
- „Seitenanzahl Umschlag RST" enthält 30 Listenwerte (ohne Umschlag, 4–100 Seiten);
  sinnvoll für RST sind nur „ohne Umschlag" und „4 Seiten" — Rest unbepreist lassen
  (wird ausgeblendet) oder löschen, sofern das Feld RST-exklusiv ist.
- **Papier Innenteil läuft über die Sorten** (paper__id, Zeilenachse der
  Preismatrix, Frontend „siehe Sorte"), **Papier Umschlag über ein Optionsfeld**
  (Listenwerte) — zwei ID-Räume; das Papiere-Blatt der Vorlage hat dafür jetzt zwei
  Spalten.

### 6.4 Offizielle Doku ausgewertet (be.print-Wiki, 07.07.)

Quelle: https://beprint.atlassian.net/wiki/spaces/PS/ (öffentlich). Erkenntnisse:

1. **Artikel-Import bestätigt** (Seite „Artikel-Export"): Die Export-XLSX ist die
   Import-Schnittstelle. `article.id` (Spalte A, Zeile 2) steuert: gleiche ID =
   überschreiben, **leer = Neuanlage**, fremde ID = anderen Artikel aktualisieren.
   Damit kann der Mapper die 12 neuen Artikel auch **selbst anlegen** (Zwei-Pass:
   1. Import mit leerer ID erzeugt Artikel samt Options-/Sorten-Zuordnung →
   2. vergebene IDs ablesen, Preis- und rai-Import). Manuelles Kopieren im Backend
   bleibt als Alternative. Vorbereitung laut Doku: mindestens eine Preisstaffel mit
   Nullwerten anlegen, damit die Struktur im Export enthalten ist.
2. **Weiterleitung mit Datenübernahme** (PDF „SA 8279", 2014): Beim rai-Sprung
   werden u. a. übernommen: **Menge (global)**, **Auswahl aller dynamischen
   Optionen (auflagenabhängig + auflagenunabhängig)**, Zusatzfelder, Versand,
   Bezahlung. Der Kunde verliert beim Format-/Farbigkeits-/Umschlag-Wechsel also
   nichts — Voraussetzung ist, dass die Schwester-Artikel **dieselben
   Optionsfelder** verwenden (bei uns gegeben). **Nicht in der Liste: die
   Sorten-Auswahl** (Papier Innenteil) — ob das Papier beim Sprung erhalten bleibt,
   im Testartikel prüfen.
3. Die Weiterleitung wird pro Option/Listenwert **in der Artikelbearbeitungsseite**
   über die Ziel-Artikel-ID gepflegt (entspricht den `.rai`-Spalten im Export —
   der Mapper schreibt sie direkt mit).

### 6.5 Mapping ausgefüllt → leadprintMapping.rst.json (07.07. abends)

Armin hat die Vorlage befüllt (`Leadprint-Mapping-ausgefüllt.xlsx`); daraus generiert:
**`src/data/leadprintMapping.rst.json`** (Generator-Ansatz: Excel → JSON, wiederholbar).
Wichtigste Erkenntnisse aus den echten IDs:

- **Die Felder des Test-Artikels 1230 SIND die RST-Felder** — endgültige Zuordnung:
  12913 = Endformat, 5561 = Bindung, 5628 = Seitenanzahl Innenteil,
  5559 = Farbigkeit Innenteil, **5563 = Seitenanzahl Umschlag** (52314 = „ohne
  Umschlag", 16136 = „4 Seiten"), 5556 = Farbigkeit Umschlag, 5555 = Papier
  Umschlag, 5562 = Veredelung, 5629 = SquareFold, 13453 = Produktionsgeschwindigkeit.
- **Folge:** Die 4 Alt-Artikel nutzen die alten Felder 5470/5510 und haben ihre
  Seitenpreise auf 5563 (= heute „Seitenanzahl Umschlag"!) liegen → beim Umbau
  werden die Felder umgezogen (12913/5559/5628/5563/5561/13453 aktiv, 5470/5510
  ab). Das steckt in den dynopt-Blöcken der Import-Datei — der Mapper erledigt es.
- **Produktionsgeschwindigkeit (13453, auflagenunabhängig)** hat 4 Listenwerte:
  Standard/Express jeweils getrennt „für GC und Kopp" (55097/55099) und „für ILDA"
  (55098/55100) — pro Artikel wird nur ein Paar bepreist (Liefertage!). Konsequenz
  zu entscheiden: Standardartikel nur mit GC/Kopp-Preisen (ILDA raus, Differenz
  minimal, einheitlich 3/2 WT)? Dann ILDA nur für Banner-Artikel (Phase 2).
- Auflagenstaffeln bestätigt **1–1000** (>500 „mit in den Shop", dort nur Kopp).
- Papiere: alle 14 Inhaltspapiere gemappt (Alias BD→BDM „Bilderdruck matt");
  offen: Listenwerte für CC_350, BD(M)_350, R_300 im Feld 5555 fehlen (anlegen
  oder aus dem Angebot nehmen; 16381 scheint frei), A6-Listenwert im Endformat
  fehlt, Shop führt zusätzlich BDG (glänzend) mit Listenwerten 16382–84 — nicht in
  der Rechner-Config: anbieten ja/nein (bräuchte Preise), N_80/N_90 ohne
  Rollen-Angabe im Blatt (Config führt sie als Inhalt — Absicht?).

### 6.6 Mapper-Berechnungsschicht gebaut & verifiziert (07.07. spät abends)

**`src/utils/leadprintMapper.js`** (im Repo, getestet über eslint + bestehende
Vitest-Suite grün) implementiert die Preismatrix-Berechnung:

- `computeInhaltZeile` / `computeArtikelOhneUmschlag`: pro Inhaltspapier × Auflage
  ein Basispreis (kleinste Seitenzahl-Stützstelle) + additive Aufschläge für alle
  weiteren Seitenzahlen — jeder Aufschlag ist die **exakte** Differenz zweier
  Engine-Ergebnisse.
- `computeUmschlagZeile` / `computeArtikelMitUmschlag`: zusätzlich Aufschlag
  „Farbigkeit Umschlag" (1/1→4/4) und „Veredelung" (nur wenn Umschlagpapier-Familie
  Cello erlaubt, sonst leer); Umschlagpapier-Kombinationen bereits nach Familienregel
  gefiltert (`familie(Umschlag) === familie(Inhalt)`).

**Verifikation (Node-Bundle via esbuild, gegen `RST-Rechner-Export.md`;
Zahlen auf Preisstand 2.2.0 / 30.07.):**
- A4 Hoch, 100 Ex., 24 S., 4/4, CC120, ohne U → Basis(8S)=122,88 € +
  Aufschlag(24S)=156,20 € = **279,08 €** ✓ exakt.
- A4 Hoch, 300 Ex., 32 S., 4/4, CC120+CC300, Cello matt → Basis + 32S-Aufschlag +
  Umschlag-4/4-Aufschlag + Cello-matt-Aufschlag = **1156,80 €** ✓ exakt.
- Seit 30.07. als Regressionstests festgehalten: `src/utils/leadprintMapper.test.js`
  (Additivität, Leer-Zellen, keine negativen Aufschläge, Familienregel).
- Familienregel bestätigt: R_100-Inhalt + R_300-Umschlag rechnet, `veredelungMoeglich:
  false` (Recycling ist nicht in `cello.erlaubteFamilien`).
- **Wichtige Erkenntnis:** Die additive Kombination ist **keine Näherung**, sondern
  exakt — auch über einen Routenwechsel hinweg (bei CC_120/100 Ex. kippt die Route
  bei 44→48 Seiten von GC auf Partner ILDA, Sprung +56,53 € statt der sonst üblichen
  ~37 € pro 4 Seiten; der Aufschlag bildet genau diesen Sprung ab, weil er direkt aus
  der Differenz der Gesamtpreise berechnet wird). Die einzige verbleibende Annahme:
  dass **Leadprint selbst** intern „Zeilenbasis + Summe der Options-Aufschläge" ohne
  weitere Rundung/Multiplikation rechnet — das bleibt der zentrale Punkt für den
  Testartikel-Import.
- Performance: volle Matrix A4H/4c ohne Umschlag (14 Papiere × 18 Auflagen × 29
  Seiten) < 20 ms, mit Umschlag (954 Zeilen) < 50 ms — die 12+ Artikel sind auch bei
  Neuberechnung nach jeder Preisänderung kein Performance-Thema.

**Preisvorschau erzeugt:** `Leadprint-Preisvorschau.xlsx` (Repo-Root) — volle Matrix
für A4 Hoch 4/4 (ohne und mit Umschlag) zur Kontrolle durch Armin/Guido, explizit
**kein** Import-Format, nur Zahlenkontrolle vor dem nächsten Schritt.

**Blockierender Fund für den XLSX-Import-Writer:** Die vier bestehenden Artikel
haben aktuell nur die **alten** Optionsgruppen aktiv (`au.5463/5515/5516`,
`aa.5470/5510/5561/5563` — geprüft direkt im Beispielexport). Die neuen RST-Felder
(12913/5559/5628/5556/5555/5562/13453/5629) sind ihnen **nicht zugewiesen**. Die
Doku deutet an, dass Options-Zuordnung zu Artikeln eine Backend-UI-Aktion ist
(Optionen müssen „vorab angelegt" sein, bevor sie im Export/Import als Spalten
erscheinen) — vermutlich pro Artikel ein Zuordnungsschritt in der
Artikelbearbeitung, nicht über den Import selbst herstellbar.
**Nächster konkreter Schritt (Armin):** Bei den 4 bestehenden Artikeln (und den
späteren Kopien) im Backend die 8 neuen RST-Optionsfelder zuordnen/aktivieren und
die alten (5470 Format, 5510 Farbigkeit) deaktivieren, dann neu exportieren — das
gibt dem Mapper die Vorlage mit der richtigen Blockstruktur, aus der der
XLSX-Import-Writer die finalen Dateien erzeugt.

### 6.7 Mengen-Interpolation im Shop analysiert (Doku „Formel 2", 07.07.)

Leadprint berechnet freie Mengen zwischen den Staffeln linear:
`Px = (SaP − SbP)/(SaW − SbW) × (ZS − SbW) + SbP` — **identisch** zur
WV-Interpolation unseres Rechners (`getPriceFromTable`). Zusatzregel („Ino"):
Eine auflagenabhängige Option, die in der unteren **oder** oberen Nachbarstaffel
nicht bepreist ist, wird für freie Mengen nicht angeboten — das macht unsere
Leer-Zellen-Strategie auch für Zwischenmengen korrekt (z. B. 52+ Seiten bei
freier Menge 7: ausgeblendet, real auch nicht produzierbar, da GC max. 48 S.
und Kopp erst ab 10 Ex.).

**Gemessene Interpolationsgüte** (Shop-Preis vs. exakter Rechner-Preis, diverse
Kombinationen, Viertel-/Mittel-/Randpunkte aller Segmente):

- Glatte Segmente: max. ±1,60 € (±0,3 %) — unkritisch, da unsere Staffeln exakt
  auf den WV-Stützstellen liegen. *(Messung auf Preisstand 2.1.0; die absoluten
  €-Werte dieses Abschnitts liegen mit 2.2.0 etwas höher, die abgeleiteten
  Entscheidungen — Grenzstaffeln 99/501 — bleiben unverändert gültig.)*
- **Aber: an Routengrenzen entsteht systematische Unterpreisung.**
  (a) GC-Ende bei 500: echter Preis springt bei 501 um ~75 € auf Kopp-Niveau; die
  Interpolation 500→600 verschleift das → bis **−96 € (−8 %)** bei ZS≈525.
  (b) Kopp→ILDA-Übergang (Konfigurationen ohne gültige GC-Route): Staffel 50 trägt
  Kopp-, Staffel 100 ILDA-Preis → bis **−79 € (−13 %)** bei ZS≈99.

**Entschieden (Armin, 08.07.): ILDA bleibt in der Preisbildung; Grenzstaffeln
fangen die Sprünge ab.** Umgesetzt: Staffelliste = 1, 2, 3, 4, 5, 10, 20, 50,
**99**, 100, 200, 300, 400, 500, **501**, 600, 700, 800, 900, 1000 (99 = letzter
Kopp-Preis vor dem ILDA-Einstieg, 501 = erster Kopp-Preis nach dem GC-Ende;
in `leadprintMapping.rst.json` als `grenzstaffeln` dokumentiert). Verifiziert mit
voller Routenlogik: max. Abweichung über alle Segmente **−2,80 € / +12,80 €**
(positiv = Shop teurer, unkritisch).

**Wo ILDA wirklich Sinn macht — vollständiger Scan (Neustand 30.07.: 71.445 gültige
Zellen über alle Standardformate × ±Umschlag × Papierkombis × 29 Seitenzahlen ×
20 Staffeln):**

- **ILDA schlägt GC+Kopp NIE, solange GC gültig ist (0 Zellen).**
  ILDA lohnt bei Standardformaten ausschließlich in der **Partner-Zone**:
  Seitenzahl über dem GC-Limit (>44/48 S. bzw. früher bei dicken Papieren)
  **und** Auflage 100–500 **und** Seiten ≤ 100 (ILDA-Tabellenende).
- Umfang: **6,6 %** aller Zellen (**A6 nie** — ILDA kann kein A6). Ersparnis gegenüber
  Kopp dort immer ≥ 30 € (Empfehlungsregel), Maximum **253,80 €**
  (A5 Hoch, BD 115, 100 S., 100 Ex.).
  *Der Anteil ist gegenüber der ersten Messung (15,4 %) gesunken, weil ILDA seit
  2.1.1 bei 500 Exemplaren endet — die Zellen 501–1000 gehören jetzt Kopp.*
- Für Banner/A4 Quer/freie Formate ist ILDA ohnehin der einzige Weg (Phase 2).

**Beide Punkte entschieden (Guido/Armin, 08.07.):**

1. **ILDA endet bei 500 Exemplaren** — umgesetzt: `maxAuflage: 500` in
   `pricingConfig.default.json` (Version 2.1.1), Test ergänzt (29 Tests grün),
   Grenzstaffel 501 fängt den Übergang zu Kopp ab. Das Empfehlungs-Flip-Flop
   bei 500/600 ist damit weg. **Achtung Betrieb:** Die produktive geteilte Config
   (Vercel Blob / Verwaltung) muss einmal nachgezogen werden — Rechner öffnen,
   Verwaltung → Standard laden bzw. ILDA-Änderung übernehmen und veröffentlichen,
   sonst rechnet die Live-App weiter ohne das Limit.
2. **Lieferzeit über Listenwert-Liefertage:** Analyse (Routenverteilung je
   Seitenzahl über alle Standardformate/Papiere/Staffeln) zeigt: **Es gibt keine
   Option, die ausschließlich bei ILDA auftritt** — Kopp deckt denselben Raum ab
   (10–99 und 501–1000 Ex. gehören in der Partner-Zone Kopp), und die
   ILDA-Bedingung „100–500 Ex." liegt auf der Staffelachse, nicht auf einer
   Option. Selbst bei 52–100 Seiten sind nur 12–25 % der Zellen ILDA, der Rest
   Kopp. **Gewählte Regel: +1 Liefertag an den Seitenanzahl-Listenwerten ab
   52 Seiten** (ab dort ist GC garantiert raus, kein GC-Kunde wird gebremst).
   Wirkung: dicke Broschüren zeigen 4 WT; in den ~75–88 % Kopp-Zellen dieser
   Werte liefern wir dann einen Tag früher als versprochen (unkritisch).
   Restlücke: 568 ILDA-Zellen (12 % der ILDA-Zone) liegen bei 36–48 Seiten mit
   dicken Papieren und zeigen 3 WT — dort entscheidet Guido je Auftrag: Kopp
   produzieren (pünktlich, 30–100 € weniger Marge) oder ILDA (+1 Tag). Die
   Produktionsweg-Matrix weist diese Zellen aus. Annahme zu verifizieren:
   Listenwert-„Liefertage" wirken additiv auf die Artikel-Produktionszeit.

**Hinweis Preisverlauf:** An der 99/100-Grenze entsteht eine ehrliche
Preis-Inversion (99 Ex. teurer als 100 Ex., z. B. 628,46 € Kopp vs. 522,83 € ILDA bei CC100/52 S.)
— das spiegelt die echte Produktionsökonomie; Kunden weichen auf 100 aus.

### 6.8 Mapper generisch auslegen — weitere Artikel folgen (07.07.)

Armin will künftig **weitere Produkte** (über RST hinaus, z. B. Softcover) über den
Mapper bauen. Screenshot aus dem Backend bestätigt zudem: Prozent-Optionen rechnen
„prozentual vom errechneten Druckpreis", auch **negative Prozente** sind möglich
(Beispiel „Produktionsgeschwindigkeit (Softcover)": Standard 0 %, Relax −10 %,
Express 25 %, Express 14 Uhr 50 %, Save my Life 100 %).

Konsequenz für den Mapper: kein RST-Spezialcode, sondern eine **deklarative
Produktdefinition** pro Produkt. Jede Optionsgruppe bekommt darin eine von vier
Befüll-Strategien:

| Strategie | Beispiel | Quelle |
|---|---|---|
| `static` | Produktionsgeschwindigkeit (0 % / +10 % Express; übrige Stufen unbepreist = ausgeblendet) | fest in der Produktdefinition |
| `computed` | Seitenzahl, Umschlagpapier, Cellophanierung — Aufschlag pro Preiszeile aus der Engine, inkl. Leer-Zellen-Regeln (Familienregel, Limits) | Engine + Config |
| `rai` | Format-/Farbigkeits-/Umschlag-Verlinkung auf Schwester-Artikel | Artikel-Blatt des Mappings |
| `off` | alle übrigen Gruppen | — |

Der Leadprint-Schreib-Layer (Blockstruktur, Preismatrix, Varieties) ist damit für
jedes Produkt wiederverwendbar; produktspezifisch bleiben nur Engine + Definition.
Für neue Produkte ohne eigene Engine (reine Staffelpreis-Artikel) genügt eine
Preistabelle als „Engine". Die `leadprintMapping.json` wird entsprechend um einen
`optionsgruppen`-Abschnitt mit Strategie-Feld erweitert.

## 7. Umsetzungsplan

1. **Mapping-Tabelle füllen** (Punkt 1) — blockiert alles Weitere.
2. **Mapper-Modul**: Vorlage-XLSX einlesen, Blöcke ersetzen, Engine-Batch-Berechnung
   (Formate × Farbigkeit × Papiere × Staffeln × Seiten), Export je Artikel +
   Produktionsweg-Matrix. Tests: Stichproben-Zellen gegen den Rechner (identische
   Werte), Struktur-Roundtrip (Export → Mapper → Datei ist strukturgleich zur Vorlage).
3. **Testartikel-Import** in Leadprint (einer, z. B. A5 1/1) → Preise im Shop-Frontend
   gegen den Rechner stichproben (klärt Punkt 2 empirisch).
4. Rollout auf alle Artikel, danach bei jeder Preispflege: Verwaltung → Config-Export
   → Mapper → Import.
