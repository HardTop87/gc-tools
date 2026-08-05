# RST-Update V4 — Guidos Feedback vom 05.08.2026

> Grundlage: Guidos Mail (4 Punkte) + `Makulatur.xlsx` · analysiert am 2026-08-05
> Code-Stand: `bug-hunt-v4` @ `eb9b65c` · Preisbasis 2.2.0
> Verwandt: `Bug-Hunt-V4-Plan.md` (B1 weiter offen; Punkt 4 hier = Abfederung von Befund D2)

Guidos vier Punkte, geordnet nach dem, was sie wirklich sind:

| Punkt | Was es ist | Schwere |
| --- | --- | --- |
| 2 — Makulatur | **Korrektur eines echten Kalkulationsfehlers** (Formel wird seit jeher falsch interpretiert) | Kern des Updates |
| 1 — Recycling-Umschlag A5 | kleine Regelausnahme (Daten + 3 Codestellen) | klein |
| 3 — 8-Seiter mit Umschlag | kleine Freischaltung, Engine kann es schon | klein |
| 4 — weicher GC→Kopp-Übergang | neuer Aufschlag mit Kalibrierungsbedarf; federt zugleich die Shop-Preisklippe ab (Bug-Hunt D2) | mittel, braucht Guidos X |

---

## 1. Punkt 2 — Makulatur (Kernstück)

### 1.1 Der Befund

`Makulatur.xlsx` enthält eine einzige Formel:

```
3 + 2,0092575059 / (Bogen + 190,4668326232)^0,08795607978 + 1097,938962524 / (Bogen + 190,4668326232)
```

Das ist eine **Prozentkurve**, gefittet auf Guidos Zieltabelle — nachgerechnet trifft sie
alle Stützpunkte (1 Bogen → 10 %, 100 → 8 %, 1.000 → 5 %, 10.000 → 4 %, ∞ → 3,2 %).
Sein Rechenbeispiel (40 S. inkl. Umschlag, 100 Ex. → 1.000 Bogenteile → Faktor 1,05 →
105 Umschläge / 945 Inhaltsbogen) reproduziert sich mit dieser Lesart exakt.

**Dieselben Konstanten stehen seit dem allerersten Commit in
`calculateRSTPrice.js` (`calcMakulatur`) — aber als absolute Bogenzahl interpretiert**
(`Math.ceil(Formelwert)` Bogen), zudem getrennt je Komponente statt auf den Gesamtauftrag.
Folge: kleine Aufträge zahlen zu viel Makulatur, große viel zu wenig (600 Netto-Bogen:
+6 statt +33; 6.000: +5 statt +247). Die neue Vergleichstabelle des Redesigns zeigt die
Makulatur prominent an — deshalb ist es Guido jetzt aufgefallen.

Guidos erste Tabelle (20 Ex. → 25 produziert = 25 %) ist die *reale* Produktionsmakulatur;
die gibt er bewusst nur teilweise weiter. Umzusetzen ist **nur die Formelkurve**.

### 1.2 Zielmodell

1. `p = Formel(Gesamt-Druckbogen des Auftrags)` — Inhalt und Umschlag **zusammen**
2. Ein gemeinsamer Faktor `1 + p/100` für beide Komponenten (Guidos Beispiel: beide × 1,05)
3. `bogenInhalt = ceil(netto × Faktor)`, Makulatur = Differenz; Umschlag analog
4. Kleinstaufträge: unter 10 Broschüren wird die Bogenbasis wie bei 10 Broschüren
   angesetzt (Guidos Regel „verhalten sich wie 10, Kompensation über den
   Verarbeitungspreis"); der Prozentsatz wird dann auf die echte Menge angewandt
5. Gilt wie bisher für alle Routen gleich (Partnerpreise werden mit derselben
   Kostenstruktur kalkuliert); DB-Faktoren bleiben auf der Netto-Bogenzahl

**Offene Frage an Guido (einzige):** Bei A5/A6 (Nutzen 2/4) — zählt für den
Prozent-Lookup die Zahl der *Bogenteile* (sein Beispielbegriff) oder der *gedruckten
SRA3-Bogen* (seine Tabellenüberschrift „Gesamtdruckbogen")? Bei A4 identisch. Empfehlung:
**gedruckte Bogen** — Makulatur entsteht physisch am Druckbogen. Differenz ist klein
(A5, 1.000 BT: 5,0 % vs. 5,66 %), aber sie soll bewusst entschieden sein.

### 1.3 Preisauswirkung (GC, A4 Hoch, CC 120, exakt durchgerechnet)

| Fall | heute | neu | Differenz | Maku Inhalt heute → neu |
| --- | --- | --- | --- | --- |
| 10 Ex. / 24 S. | 70,72 € | 69,51 € | **−1,21 €** | 9 → 6 |
| 50 Ex. / 24 S. | 174,59 € | 179,23 € | +4,64 € | 7 → 20 |
| 100 Ex. / 24 S. | 279,08 € | 288,62 € | +9,54 € (+3,4 %) | 6 → 34 |
| 250 Ex. / 24 S. | 567,77 € | 589,03 € | +21,26 € | 5 → 71 |
| 500 Ex. / 24 S. | 1.030,76 € | 1.069,46 € | +38,70 € (+3,8 %) | 5 → 130 |
| Guidos Beispiel: 100 Ex. / 36 S. + U | 479,46 € | 491,10 € | +11,64 € | I: 6 → 46 · U: 9 → 6 |

Kleinstaufträge werden etwas **billiger**, ab ~50 Ex. wird es **3–4 % teurer** — genau die
Papier-/Klickkosten der real nötigen Mehrbogen. Das sollte Guido als Nebeneffekt
bestätigen (seine Formel, seine Zahlen — aber er validiert gerade gegen die alten Preise).

### 1.4 Umsetzung

- `calcMakulatur` → `calcMakulaturProzent` (Konstanten unverändert, ohne `ceil`);
  Aufruf in `calcSingleRoute` auf Gesamtbogen-Basis umstellen. Konstanten bleiben
  hartkodiert wie die DB-Formeln — sie sind Kurve, nicht Pflegewert.
- Tests: Referenzwerte anpassen; neuer Test exakt auf Guidos Beispiel
  (1.000 BT → 1,05 → 105/945); Kleinstauftrags- und Nutzen-Fälle.
- Danach neu erzeugen: `RST-Rechner-Export.md` (Guidos Kontrollgrundlage) und
  `Leadprint-Preisvorschau.xlsx`.
- **Versionierung:** Preise ändern sich durch Code, nicht durch Config — damit
  „Preisbasis {version}" ehrlich bleibt: Repo-Default auf **2.3.0** bumpen
  (Kommentar: neues Maku-Modell) und nach dem Deploy in der Verwaltung
  „Auf Standard zurücksetzen" + veröffentlichen. Der bestehende
  „Repo-Standard ist neuer"-Banner führt da hin.

### 1.5 Leadprint-Verträglichkeit

- Der Mapper ruft `calculateRSTPrice` → erbt das Modell automatisch. Die additive
  Aufschlagslogik bleibt **exakt**, weil jeder Aufschlag die Differenz zweier voll
  gerechneter Preise ist.
- Neue, winzige Kombinationsabhängigkeit: Der Maku-Prozentsatz hängt jetzt am
  Gesamtvolumen, dadurch variiert die Umschlag-Bogenzahl leicht mit der Seitenzahl des
  Inhalts. Die einmal an der Basis-Seitenzahl berechneten Aufschläge für
  Umschlag-Farbigkeit und Veredelung sind damit nicht mehr streng seitenzahl-konstant —
  Abweichung in der Größenordnung **eines Umschlagbogens** (~0,1–0,3 €). Akzeptieren und
  im Konzept vermerken.
- Die alte Absolut-Maku sprang durch `ceil` zwischen Staffeln; die Prozentkurve ist
  glatter — Leadprints lineare Mengen-Interpolation zwischen Auflagenstaffeln wird eher
  **besser** getroffen.
- Die Grenzstaffeln 99/501 (Routen-Sprünge in der Auflage) wurden mit alten Preisen
  verifiziert (−2,80/+12,80 €) → **Verifikation nach der Umstellung wiederholen**.

---

## 2. Punkt 1 — Recycling-Inhalt mit CC/Natur-Umschlag (A5 Hoch)

### 2.1 Lage

R_90 ist bei A5 Hoch das einzige Recycling-Inhaltspapier, und seit V3 gibt es dort keinen
R-Umschlag mehr (R_300 raus, Breitbahn). Die Familienregel macht „R_90 mit Umschlag"
damit komplett unmöglich — CC_250 und N_250 sind als Umschläge längst konfiguriert, es
blockiert allein die Regel. Guido will genau diese zwei als Ausnahme. Sein Fallback
(„R_90 sonst raus") ist unnötig — die Ausnahme ist sauber machbar.

### 2.2 Umsetzung

- **Datenmodell:** `config.umschlagAusnahmen: { "R_90": ["CC_250", "N_250"] }` —
  Inhaltspapier-ID → zusätzlich erlaubte Umschlag-IDs. Bewusst ID- statt familienbasiert:
  R_90 existiert **nur** bei A5 Hoch als Inhalt, die Ausnahme wirkt also automatisch
  nirgendwo sonst (A4/A5Q/A6-Recycling hat R_300 als Umschlag und bleibt unberührt).
  Geschnitten wird weiterhin mit `format.papiereUmschlag`.
- **Drei Prüfstellen anpassen:** Engine-Familiencheck (`calcSingleRoute`),
  `getCoverPaperOptions` (Rechner-Dropdown) und der Familienfilter in
  `computeArtikelMitUmschlag`. Für die dritte Stelle der eigentliche Gewinn:
  **den eigenen Filter des Mappers durch `getCoverPaperOptions` ersetzen** —
  eine einzige Quelle für „welcher Umschlag ist zulässig", kein Drift mehr möglich.
- `validatePricingConfig`: neues Feld prüfen (IDs existieren, optional, leeres Objekt ok).
- Verwaltung: keine eigene UI nötig — Pflege über den JSON-Import, wie andere
  Strukturänderungen auch.
- Cello: CC_250-Umschlag erlaubt Cellophanierung (hängt korrekt an der
  Umschlag-Familie) — auch auf R-Inhalt. Fachlich plausibel, kein Sonderfall nötig.

### 2.3 Leadprint-Verträglichkeit

Die Familienregel wird im Shop über leere Preiszellen abgebildet (Option ohne Preis wird
ausgeblendet — bestätigt 07.07.). Die Ausnahme fügt schlicht **Preise hinzu**, wo vorher
leer war: `computeArtikelMitUmschlag` erzeugt über den gemeinsamen Helper automatisch
die Zeilen R_90 × CC_250 / N_250. Kein neuer Mechanismus, keine Backend-Änderung —
nur die beim Writer-Bau ohnehin fällige Kontrolle, dass gefüllte und leere Zellen die
Kombinatorik exakt spiegeln.

---

## 3. Punkt 3 — 8-Seiten-Broschüre mit Umschlag (4 Seiten Inhalt)

### 3.1 Lage

Die Engine kann es fast schon: 4 Seiten Inhalt = 1 Bogenteil + 1 Umschlag = 2 Bogenteile
gesamt — **Zeile 2 existiert in allen WV-Tabellen.** Es blockiert nur die Eingabe
(min 8) und ein Guard (`maxSeiten < 8`).

### 3.2 Umsetzung

- Engine: Seiten ≥ 4 zulassen, wenn Umschlag aktiv; der „zu dick"-Guard von `< 8` auf
  `< 4` bei Umschlag. Ohne Umschlag bleibt 8 das Minimum (1 Bogenteil allein ist keine
  Rückstichheftung).
- Rechner: Eingabe 4 → Umschlag automatisch aktivieren (Guidos Wunsch), mit kurzem
  Hinweis in der Statuszeile; Abwahl des Umschlags bei 4 Seiten setzt auf 8 zurück.
  Hier fließt **Bug-Hunt B5** gleich mit ein: klare Validierungsmeldung
  „Seitenzahl muss ein Vielfaches von 4 sein; 4 Seiten nur mit Umschlag" statt der
  irreführenden Preistabellen-Meldung.
- Tests: 4-Seiten-Fälle je Route (WV-Zeile 2, Gewicht, Maku).

### 3.3 Leadprint-Verträglichkeit — einziger Haken

Die Seitenzahl-Optionsgruppe (5628) hat Listenwerte ab 8. Für den Shop braucht es einen
**neuen Listenwert „4"** — das ist wie die Feldzuweisung eine **Backend-UI-Aktion**,
nicht per Import anlegbar. Danach: `SEITEN_STUETZSTELLEN` um 4 erweitern für
mit-Umschlag-Artikel (der `seitenListe`-Parameter existiert schon); im ohne-Umschlag-
Artikel bleibt die 4-Zelle leer → ausgeblendet. Ob 4 als eigene Basis oder als negativer
Aufschlag zur 8er-Basis geschrieben wird, entscheidet der Writer (Leadprint kann beides).

---

## 4. Punkt 4 — weicher GC→Kopp-Übergang (Dickenaufschlag)

### 4.1 Guidos Formel, präzisiert

> Aufschlag = (Buchdicke − 1) × (Auflage − A0) × X, nur GC, Dicke 1,0–1,5 mm, ab A0 = 100 (evtl. 50)

- **Buchdicke** konsistent zur bestehenden Dickenformel (Spec 4.2):
  `(Seiten/4) × Blattdicke Inhalt + 1 × Blattdicke Umschlag`, in mm. Oberhalb 1,5 mm
  ist GC ohnehin raus (maxDickeGC) — die Formel braucht keinen eigenen Deckel.
- Drei neue Settings (Tab *RST › Faktoren & Grenzen*, `SETTINGS_META`):
  `gcDickenAufschlagAbMm` (1,0) · `gcDickenAufschlagAbAuflage` (100) ·
  `gcDickenAufschlagFaktor` (X, wählt Guido). Route-Flag analog `umschlagZuschlag`.
- Einrechnung wie der Umschlag-Zuschlag: Teil der Basis **vor** dem Express-Aufschlag.
  Eigene Zeile in der Vergleichstabelle (nur wenn > 0), damit der Aufschlag sichtbar
  bleibt statt still den Preis zu heben.

### 4.2 Was die Kalibrierung ergeben hat (Basis für Guidos Tabelle)

264 Kombinationen durchgerechnet (A4 Hoch, alle Inhaltspapiere mit 1,0–1,5 mm bei
8–48 Seiten, Auflagen 100–500, ohne Umschlag). Kernbefunde:

1. **Der Abstand GC ↔ bester Partner ist in der Zielzone klein** (26–93 €) — ideale
   Voraussetzung für einen weichen Übergang, kleine X reichen für spürbare Wirkung.
2. Das X, ab dem die Empfehlung kippt (GC > Partner + 20 € Toleranz), streut je nach
   Dicke/Auflage: dickste + größte Aufträge kippen ab X ≈ 0,75 €, mittlere brauchen 2–4 €.
   Grob: **X = 1 →** nur die Extremfälle wandern (27 von 220), **X = 2 →** gut ein
   Drittel, **X = 3 →** gut die Hälfte.
3. **Es kippt ganz überwiegend zu Kopp**, wie von Guido gewünscht: bei X = 1 alle
   27 gekippten Kombinationen, bei X = 2 sind es 75 von 83 (8 zu ILDA, +1 Werktag),
   bei X = 3 dann 98 von 117. Die ILDA-Fälle stehen im Detailblatt — ob sie stören,
   entscheidet Guido (sonst wäre `preferKoppDelta`, heute 30 €, der zweite Regler).
4. **Robust gegen die Maku-Umstellung:** Papier- und Klickkosten sind bei
   Standardformaten für GC und Partner identisch (gleicher Nutzen) — das neue Maku
   verschiebt beide gleich, die *Differenz* und damit die Kalibrierung von X bleiben
   gültig. Punkt 4 muss also nicht auf Punkt 2 warten, nur die Endkontrolle läuft nach
   der Maku-Umstellung.
5. **Zusammenhang Bug-Hunt D2:** Die 150–257-€-Sprünge im Shop sitzen an der
   48/52-Seiten-Kante (GC-WV endet bei 12 Bogenteilen). Dort ist die Dicke bereits
   > 1 mm — der Aufschlag verteuert GC vor der Kante kontinuierlich und **verkleinert
   genau diese Sprünge**. Punkt 4 ist Guidos D2-Abfederung.

Die Tabelle für Guido liegt als **`Dickenaufschlag-Kalibrierung.xlsx`** neben diesem
Dokument (lokal, nicht im Repo — xlsx ist ignoriert): Lesehilfe, Kippgrenzen-Matrix
(nötiges X je Papier × Seiten × Auflage) und Detailblatt mit Aufschlag/Empfehlung für
X = 1 / 1,5 / 2 / 3. Guido wählt X und A0.

---

## 5. Reihenfolge und offene Fragen

**Umsetzungsreihenfolge:**

1. **P2 Makulatur** — Korrektur zuerst, alle Referenzzahlen hängen daran
   (Tests, Referenz-Export, Preisvorschau, Version 2.3.0 + Publish)
2. **P1 + P3 zusammen** — beide klein, beide berühren Engine + Rechner + Mapper;
   B5 aus dem Bug-Hunt fließt in P3 ein
3. **P4** — sobald Guido X und A0 gewählt hat; technisch von P2 unabhängig,
   Endkontrolle danach

**Fragen an Guido (gesammelt in einer Mail):**

1. Maku-Basis bei A5/A6: Bogenteile oder gedruckte SRA3-Bogen? (Empfehlung: gedruckte)
2. Nebeneffekt bestätigen: Kleinstaufträge minimal billiger, ab ~50 Ex. 3–4 % teurer
3. P4: X und A0 aus der Kalibrierungstabelle wählen; und: darf die Empfehlung bei
   mittleren Auflagen zu ILDA gehen, oder soll sie gezielt zu Kopp?
4. **B1 aus dem Bug-Hunt, weiter unbeantwortet:** Kopp oberhalb 1.000 Ex. —
   Deckel oder Extrapolation? (Heute rechnet die App dort mit eingefrorener
   Verarbeitung: 176 € bei 20.000 Ex.)

**Nach Abschluss aller Punkte:** Leadprint-Preisvorschau und Grenzstaffel-Verifikation
neu, Referenz-Export neu, Version 2.3.0 veröffentlichen.
