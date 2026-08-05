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

**Entschieden (Armin, 05.08.):** Basis sind die **gedruckten SRA3-Bogen** (Guidos
Tabellenüberschrift „Gesamtdruckbogen"). Der Prozentsatz wird auf die gedruckten Bogen
je Komponente angewandt; da Bogen proportional zu Exemplaren sind, skaliert die
produzierte Exemplarzahl mit demselben Faktor — Guidos Beispiel (105 Umschläge aus
100) bleibt exakt getroffen. Bei Guidos Rückkehr kurz mitbestätigen lassen (bei A4
sind beide Lesarten identisch, sein Beispiel entscheidet es nicht allein).

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

### 4.2 Kalibrierung über alle GC-Formate (Stand 05.08., zweiter Durchlauf)

2.443 Kombinationen durchgerechnet: **alle vier GC-Formate** (A4 Hoch, A5 Hoch,
A5 Quer, A6 Hoch), alle Inhaltspapiere, **ohne und mit Umschlag** (leichtestes Papier
derselben Familie), Buchdicke 1,0–1,5 mm, Auflagen 50–500. Kernbefunde:

1. **A4 Hoch, A5 Hoch und A5 Quer verhalten sich exakt gleich** (Streuung der
   Kipp-Schwelle: 0,000000 € bei 644 formatübergreifend vorkommenden Kombinationen,
   davon 483 in allen drei Formaten). Grund: Papier- und Klickkosten sind je Format für
   GC und Partner identisch (gleicher Nutzen) und kürzen sich aus der Differenz; übrig
   bleibt die WV-Differenz, die nur an Bogenteilen × Auflage hängt. **Eine Kalibrierung
   gilt für alle drei Formate.**
2. **A6 ist der Sonderfall — weil ILDA A6 gar nicht produziert** (`ilda.formate` enthält
   A6_Hoch nicht; nachgeprüft: 552 von 552 A6-Zeilen ohne ILDA-Preis). Einziger Partner
   ist dort Kopp, rund 80 € teurer → A6 kippt später. Eigenes Blatt.
3. **Unter 100 Ex. liefert die ILDA-WV-Tabelle keine Werte** — einziger Partner dort ist
   ebenfalls Kopp. Bei 50 Ex. kippt in **keiner** Variante etwas (GC liegt klar vorn),
   ein Aufschlag mit A0 < 100 steuert dort also nichts.

### 4.3 A0 ist kein Nebenparameter — Korrektur der ersten Empfehlung

Der erste Durchlauf empfahl A0 = 50 / X = 4 mit dem Argument „mehr Hebel bei 100 Ex.".
Das greift zu kurz: **A0 ist zugleich der Nullpunkt der Formel und die Auflage, ab der
der Aufschlag überhaupt greift.** Beides muss derselbe Wert sein, sonst entsteht bei
dieser Auflage ein Preissprung (bei A0 = 50 und Start erst ab 100 Ex.: 20–100 € Sprung
je nach Dicke) — genau die „unlogischen Sprünge", die Guido reduzieren will.

Damit ist A0 die Antwort auf eine fachliche Frage: **ab welcher Auflage soll der
Aufschlag zu wirken beginnen?** Und weil X jeweils nachkalibriert wird, sind die
Varianten direkt vergleichbar (X so gewählt, dass ab 200 Ex. alle ≥ 1,25 mm kippen):

| A0 | X | 100 Ex. | 150 Ex. | ab 200 Ex. | zu ILDA | Aufschlag 1,2 mm/150 Ex. |
| --- | --- | --- | --- | --- | --- | --- |
| 50 | 4,00 € | **57 %** | 97 % | 100 % | 16 % | 80 € |
| 75 | 4,75 € | 15 % | 94 % | 100 % | 12 % | 71 € |
| **80** | **5,00 €** | 4 % | **93 %** | 100 % | **11 %** | 70 € |
| 85 | 5,25 € | 0 % | 92 % | 100 % | 10 % | 68 € |
| 100 | 6,00 € | 0 % | 81 % | 100 % | 10 % | 60 € |

(Anteil der Broschüren ab 1,25 mm, die zum Partner wechseln.)

Ab 200 Ex. sind **alle Varianten gleichwertig** — der Unterschied liegt allein im Band
100–150 Ex. Höheres A0 bedeutet: sanfterer Einstieg, steilerer Verlauf oben, weniger
ILDA-Fälle.

**Empfehlung: A0 = 80, X = 5,00 €.**
- Runde Werte, gut erklärbar.
- Aufträge unter 80 Ex. bleiben völlig unberührt; zwischen 80 und 99 Ex. entsteht ein
  kleiner Aufschlag (max. ~30 €), der die Empfehlung dort noch nicht verschiebt.
- Bei 150 Ex. wirkt der Aufschlag schon (93 % statt 81 % bei A0 = 100).
- Einstieg weich: 1,2 mm / 120 Ex. → 40 €, 1,2 mm / 200 Ex. → 120 €;
  oben deutlich: 1,45 mm / 500 Ex. → 945 €.
- Nur 11 % der wechselnden Aufträge gehen zu ILDA statt Kopp (bei A0 = 50: 16 %).

**Wenn Guido will, dass schon genau 100 Ex. zu Kopp gehen**, ist A0 = 50 / X = 4 die
richtige Wahl — mit dem Preis, dass auch Aufträge zwischen 50 und 99 Ex. teurer werden,
ohne dass sie wechseln. Das ist die eine Frage, die er entscheiden muss.

### 4.4 Weitere Befunde

4. **Strukturelle Grenze der Formel:** Kombinationen mit Dicke knapp über 1,0 mm oder
   Auflage nahe A0 haben einen winzigen Hebel und kippen bei keinem vernünftigen X
   (Gesamtzone bei der Empfehlung: 63 %). Das ist kein Fehler, sondern der weiche
   Übergang, den Guido will — Grenzfälle bleiben bei GC.
5. **Ein Teil kippt zu ILDA statt Kopp** (wo ILDA > 30 € unter Kopp liegt; +1 Werktag).
   Guido entscheidet, ob das ok ist — sonst wäre `preferKoppDelta` (heute 30 €) der
   zweite Regler.
6. **Robust gegen die Maku-Umstellung:** Das neue Maku verschiebt GC und Partner gleich,
   die Differenz und damit die X-Wahl bleiben gültig. Endkontrolle nach P2 genügt.
7. **Zusammenhang Bug-Hunt D2:** Die 150–257-€-Sprünge im Shop sitzen an der
   48/52-Seiten-Kante (GC-WV endet bei 12 Bogenteilen). Dort ist die Dicke bereits
   > 1 mm — der Aufschlag verteuert GC vor der Kante kontinuierlich und **verkleinert
   genau diese Sprünge**. Punkt 4 ist Guidos D2-Abfederung.

### 4.5 Woher die Preissprünge wirklich kommen (Analyse 06.08.)

Guidos zweites Ziel — „unlogische Sprünge reduzieren" — habe ich bisher ungeprüft
übernommen. Die Messung aller Sprünge über 25 % (A4/A5/A6, alle Papiere, 100/200/500 Ex.,
8–120 Seiten) ordnet sie so zu:

| Ursache | Anzahl |
| --- | --- |
| Staffelsprung **innerhalb** derselben Route (ein Bogenteil mehr) | **138** |
| GC fällt an der Dickengrenze 1,5 mm raus | 20 |
| GC fällt am Ende der WV-Tabelle raus (12 Bogenteile) | 18 |
| Routenwechsel ILDA → Kopp | 3 |

**77 % der großen Sprünge haben mit dem Produzentenwechsel nichts zu tun.** Der
Routenwechsel GC → Partner erzeugt nur eine Lücke von **4–6 %** (19–98 €), weil die
Empfehlungstoleranz von 20 € ohnehin dafür sorgt, dass gewechselt wird, solange die
Preise nah beieinander liegen.

**Ursache 1 — Arithmetik, unvermeidbar (dominant).** Zerlegung des Sprungs
8 → 12 Seiten bei 500 Ex. (CC 100, GC): Gesamt +148 €, davon

| Block | Anteil am Sprung |
| --- | --- |
| Druckkosten | **72 %** |
| Papierkosten | 21 % |
| Verarbeitung | 7 % |
| Einrichtung | 0 % (fix) |

Von 8 auf 12 Seiten sind es 50 % mehr Inhalt, also 50 % mehr Bogen, also 50 % mehr
Druck und Papier. Der Preis steigt dabei sogar **unterproportional**:

| Übergang | Bogenteile | Preis | Verhältnis |
| --- | --- | --- | --- |
| 8 → 12 S. | +50 % | +41 % | 0,83 |
| 12 → 16 S. | +33 % | +29 % | 0,86 |
| 20 → 24 S. | +20 % | +18 % | 0,90 |
| 36 → 40 S. | +11 % | +10 % | 0,91 |

Der Preis wächst also *langsamer* als die Arbeit — Einrichtekosten sind fix, die
DB-Faktoren sinken mit der Menge. Die Sprünge wirken nur am unteren Ende groß, weil dort
der kleinstmögliche Schritt (4 Seiten) relativ am größten ist. Das ist korrekt und
durch keine Preisformel zu beheben.

**Ursache 2 — echte Stufen in den Verarbeitungstabellen (nicht proportional).**
Der Zuwachs je zusätzlichem Bogenteil ist in allen drei Tabellen unregelmäßig:

| Tabelle | normaler Zuwachs (100 Ex.) | Stufen bei Bogenteil | Stufenhöhe |
| --- | --- | --- | --- |
| **GC (Horizon)** | 6,50 € | **7** | 16,50 € (2,5-fach) |
| **Kopp** | ~15 € | **4, 7, 13, 19, 25** (alle 6) | ~33 € (2-fach) |
| **ILDA** | **0 €** auf Plateaus von 4 BT | 3, 6, 10, 14, 18, 22 | 3,60–18 € (bei 500 Ex. bis 75 €) |

- **GC** ist bis auf eine Stelle völlig gleichmäßig: bei 7 Bogenteilen (28 Seiten)
  springt der Preis um das 2,5-fache eines normalen Schritts. Im Kundenpreis:
  24 → 28 Seiten kostet +17,4 % statt der sonst üblichen ~12–16 % (100 Ex.:
  259 → 304 €).
- **Kopp** hat dasselbe Muster alle 6 Bogenteile.
- **ILDA** ist eine Treppenfunktion: Drei Seitenschritte kosten in der Verarbeitung
  **gar nichts**, der vierte springt.

Das sieht nach Maschinenlogik aus (Anzahl der Anlagen/Stationen am Sammelhefter — bei
GC und Kopp passt ein Muster von 6, bei ILDA von 4). Es sind Guidos bzw. die
Partnertabellen selbst, nicht unsere Rechnung. **Frage an Guido:** Ist die Stufe bei
7 Bogenteilen in der GC-Tabelle so gewollt (zweiter Durchlauf / zusätzliche Station)?
Falls sie ein Tippfehler in der V3-Tabelle ist, verschwindet damit einer der
auffälligsten Sprünge im Sortiment.

**Konsequenz für Punkt 4:** Ein Preisaufschlag kann Ursache 1 nicht beheben (sie ist
korrekt) und Ursache 2 nicht (sie steckt in den Tabellen). Gemessen: Sprünge über 25 %
heute 505, mit Guidos Formel 560 — also eher mehr. Der Aufschlag ist ein
**Steuerungsinstrument, kein Glättungsinstrument**. Das sollte in der Antwort an Guido
klar stehen, sonst erwartet er eine Wirkung, die nicht eintritt.

### 4.6 Alternativen zu Guidos Formel

Drei grundsätzlich andere Ansätze durchgerechnet, jeweils über die gesamte Zone
(1,0–1,5 mm, ab 100 Ex., alle GC-Formate):

| Ansatz | Steuerung | Sprünge > 25 % | Verteuerung ohne Wirkung |
| --- | --- | --- | --- |
| heute (nichts) | 0 % | 505 | — |
| **Guido:** (Dicke−1)×(Auflage−80)×5 | 61 % | 560 | Ø 37 € in 393 Fällen |
| **Prozentualer Aufschlag** auf den GC-Preis | 11 % | 480 | Ø 28 € in vielen Fällen |
| **Angleichung** an den Partnerpreis | 23 % | 494 | Ø 41 € in 776 Fällen |
| **Auflagenabhängige Komfortgrenze** | 61 % → **100 %** möglich | 570 | **keine** |

**Warum Guidos Formel strukturell nicht passt.** Der tatsächlich nötige Aufschlag
(gemessen als „wie viel muss auf den GC-Preis, damit die Empfehlung kippt") verhält sich
genau umgekehrt zur Formel:

| Auflage | nötiger Aufschlag (Median) | Guidos Formel liefert |
| --- | --- | --- |
| 100 Ex. | 22 % des Preises | 0,3-faches des Nötigen |
| 200 Ex. | 19 % | 1,4-faches |
| 500 Ex. | 9 % | **5,1-faches** (bis 1.037 €) |

Der Bedarf wächst degressiv (bei großen Auflagen dominieren die für alle Routen
identischen Papier- und Klickkosten), Guidos Formel wächst linear mit der Auflage.
Deshalb gibt es kein X, das die Zone sauber abdeckt: zu klein → bei 100 Ex. passiert
nichts, zu groß → 500er-Aufträge werden vierstellig verteuert. Dazu streut der Bedarf
stark nach Format (A4 Median 10 %, A6 Median 30 %, weil ILDA A6 nicht produziert).

**Alternative A — auflagenabhängige Komfortgrenze (Empfehlung).**
Statt eines Preisaufschlags wird die bereits existierende Dickengrenze
`maxDickeGC` (heute konstant 1.500 µm) auflagenabhängig:

```
bis  99 Ex.:  1500 µm   (wie heute)
ab  100 Ex.:  1000 µm   (Guidos Komfortzone)
```

Das ist Guidos Regel wörtlich, in der Sprache eines Konzepts, das die App schon hat.
Ergebnis: **100 % Steuerung** (statt 61 %), keine Kalibrierung, keine Nachjustierung bei
Preisänderungen, kein Format-Sonderfall — und **kein einziger Auftrag wird teurer, ohne
zu wechseln** (bei Guidos Formel: 393 Fälle). Pflege: zwei Zahlen in der Verwaltung.
Die bestehende Fehlermeldung und die Vergleichstabelle funktionieren unverändert.

Einwand „harte Kante": Die Lücke am Übergang beträgt gemessen 4–6 %. Die
Verarbeitungstabellen erzeugen an anderen Stellen Sprünge von 17 %+. Die Kante wäre
also kleiner als das, was ohnehin überall passiert.

**Alternative B — Angleichung an den Partnerpreis (falls der weiche Übergang gewünscht
bleibt).** Über die letzten 0,25 mm vor der Grenze wächst der GC-Preis anteilig auf
„günstigster Partner + Toleranz" zu. Vorteile gegenüber einer freien Formel: Sie folgt
dem Bedarf per Konstruktion statt ihn zu schätzen, gilt ohne Sonderfall für A4 wie A6,
bleibt bei Preisänderungen gültig, und der Kunde zahlt nie mehr als den Partnerpreis
(darüber wird automatisch gewechselt). Sinnvoll **zusätzlich** zu Alternative A, nicht
statt ihrer — allein erreicht sie nur 23 %.

**Empfehlung fürs Gespräch mit Guido:** beide Wege zeigen. Seine Formel ist umsetzbar
und mit A0 = 80 / X = 5 brauchbar kalibriert; die Komfortgrenze erreicht dasselbe Ziel
vollständig, ohne Kalibrierung und ohne Nebenwirkungen. Dazu der Hinweis, dass die
Sprünge, die ihn stören, aus den Verarbeitungstabellen kommen und von beiden Varianten
unberührt bleiben.

### 4.7 Die Tabelle für Guido

**`Dickenaufschlag-Kalibrierung.xlsx`** (Repo-Root, lokal — xlsx ist ignoriert),
sieben Blätter:

1. **Lesehilfe** — Formel, Datenbasis, Empfehlung A0 = 80 / X = 5, Entscheidungsfragen
2. **Alternative** — die Komfortgrenze aus 4.6, mit Gegenüberstellung beider Wege
3. **Preissprünge** — die Analyse aus 4.5 in Guidos Sprache, inkl. der Rückfrage zur
   Stufe bei 7 Bogenteilen
4. **A0-Vergleich** — die Tabelle aus 4.3
5./6. **Kippgrenzen A4+A5** (96 Kombis) und **A6** (92), mit Ampelfarben
7. **Detail** — 2.443 Zeilen, filterbar: GC/Kopp/ILDA-Preise, heutige Empfehlung,
   nötiges X für A0 = 50/80/100, Aufschlag und neue Empfehlung bei A0 = 80 / X = 5

**Vollständig gegengeprüft (06.08.):** Alle 2.443 Detailzeilen, beide Kippgrenzen-Blätter,
die fünf Zeilen des A0-Vergleichs und acht Textaussagen der Lesehilfe wurden unabhängig
aus der Engine neu berechnet und Zelle für Zelle verglichen — keine Abweichung. Die im
Blatt verwendete Empfehlungslogik stimmt bei allen 2.443 Fällen exakt mit
`pickRecommendedRouteName` überein.

---

## 5. Reihenfolge und offene Fragen

**Umsetzungsreihenfolge:**

1. **P2 Makulatur** — Korrektur zuerst, alle Referenzzahlen hängen daran
   (Tests, Referenz-Export, Preisvorschau, Version 2.3.0 + Publish)
2. **P1 + P3 zusammen** — beide klein, beide berühren Engine + Rechner + Mapper;
   B5 aus dem Bug-Hunt fließt in P3 ein
3. **P4** — sobald Guido X und A0 gewählt hat; technisch von P2 unabhängig,
   Endkontrolle danach

**Entschieden am 05.08. (Armin):**

- **Maku-Basis: gedruckte SRA3-Bogen** (siehe 1.2) — bei Guido kurz mitbestätigen.
- **B1 / Kopp-Obergrenze: `maxAuflage: 1000` für Kopp** (Guidos Matrix: Kopp bis
  1.000, ILDA bis 500; darüber ist keine Kalkulation möglich). Wandert als
  Config-Änderung ins P2-Paket (Version 2.3.0) — die bestehende Fehlermeldung
  „ist auf maximal 1000 Exemplare begrenzt" greift dann automatisch.

**Fragen an Guido (gesammelt in einer Mail, wenn er zurück ist):**

1. Nebeneffekt der Maku-Korrektur bestätigen: Kleinstaufträge minimal billiger,
   ab ~50 Ex. 3–4 % teurer; Basis „gedruckte Bogen" mitbestätigen
2. P4 — **Grundsatzfrage:** Preisaufschlag (seine Formel, A0 = 80 / X = 5) oder
   auflagenabhängige Komfortgrenze (Alternative A, 4.6)? Beides erreicht sein Ziel,
   die Grenze vollständig und ohne Kalibrierung.
3. P4: Falls Aufschlag — sollen Aufträge mit genau 100 Ex. bereits zu Kopp gehen?
   (Dann A0 = 50 / X = 4)
4. P4: Darf die Empfehlung zu ILDA gehen, wo ILDA deutlich günstiger ist (+1 Werktag),
   oder sollen alle gewechselten Aufträge zu Kopp?
5. **Stufe bei 7 Bogenteilen in der GC-Verarbeitungstabelle** (4.5): gewollt
   (zweiter Durchlauf / zusätzliche Station) oder Fehler in der V3-Tabelle?
6. Hinweis, keine Frage: Die Preissprünge, die ihn stören, kommen zu 77 % aus der
   Seitenzahl selbst und aus den Verarbeitungstabellen — ein Aufschlag ändert daran
   nichts.

**Nach Abschluss aller Punkte:** Leadprint-Preisvorschau und Grenzstaffel-Verifikation
neu, Referenz-Export neu, Version 2.3.0 veröffentlichen.
