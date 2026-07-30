# RST-Update V3 — Analyse & Umsetzungsplan (Stand 2026-07-30)

> Grundlage: Mail Guido Coenen (30.07.2026) mit `RST GC-AR-V3.xlsx` (Blätter BERECHNUNG,
> PAPIER, Data_GC) und `Preise gc.xlsx` (aktualisierte Papierliste mit Preisen 07/2026,
> Laufrichtung und Formatverfügbarkeit).
> Ist-Stand: `pricingConfig.default.json` Version 2.1.1.
> Alle Preise EUR netto.

---

## 1. Was Guido geliefert hat

| Quelle | Inhalt |
|---|---|
| `Preise gc.xlsx`, Blatt PAPIER, **Spalte F** | **Neue Papierpreise 07/2026** pro 1000 Bogen (Spalte C = alte Preise, entspricht unserem Ist-Stand) |
| dieselbe Datei, Spalten E/H/I/K | **Laufrichtung** (beide / BB = Breitbahn / SB = Schmalbahn) und daraus abgeleitet die **Verfügbarkeit je Formatgruppe** (A6H+A5Q+A4H / A5H / Banner) |
| `RST GC-AR-V3.xlsx`, Blatt **Data_GC** Zeilen 5–15 | **Neue GC-Verarbeitungspreise** (grün markiert = neu) |
| Data_GC Zeilen 39–69 | Seitenlimit-Matrix — **wird ignoriert** (Entscheidung Armin 30.07., siehe Kasten unten) |
| Data_GC Zeilen 39–54, rechte Spalten | Schema Inhalt×Umschlag-Kombinationen — **wird ignoriert** (dito) |
| Blatt **BERECHNUNG** | Guidos eigenes Kontrollblatt (Selbstkosten) — **nicht** zu übernehmen, siehe 7.1 |
| Blatt **PAPIER** in V3 | identisch mit unseren aktuellen (alten) Preisen — irrelevant, die neue Liste steht in `Preise gc.xlsx` |

**Beantwortete Fragen aus Armins Mail:** R_90-Preis geklärt (41,20 €); Natur-Banner
geklärt (siehe 3.); KM-Inline entfällt endgültig (keine eigene Route nötig); A5 bei GC
mit 2 Nutzen auf SRA3 ist bestätigt.

> **Entscheidung (Armin, 30.07.):** Die beiden Matrizen in Data_GC (Seitenlimits je
> Papier, Inhalt×Umschlag-Kombinationen) werden **nicht** übernommen. Es bleibt bei der
> im Code umgesetzten Logik — **Seitenlimits aus der Dickenformel**
> (`floor(maxDicke / Blattdicke) × 4`, GC 1500 µm / Partner 2500 µm) und der
> **Familienregel** für Umschläge (CC↔CC, N↔N, BD↔BD, R↔R) — bereinigt nur um die
> **Papier-Verfügbarkeit** laut Guidos Liste (Laufrichtung je Formatgruppe, Kap. 5).

---

## 2. Neue Papierpreise (30 Änderungen)

Durchschnitt **+9,3 %**, Spanne −8 % bis +26 %. Auffällig: ColorCopy zieht stark an
(+16 bis +26 %), Bilderdruck schwer wird billiger (BD_350 −8 %), Natur uneinheitlich.

| Papier | alt | neu | Δ | | Papier | alt | neu | Δ |
|---|---|---|---|---|---|---|---|---|
| N_80 | 24 | **30** | +25 % | | CC_100 | 35 | **43** | +23 % |
| N_90 | 27 | **33,7** | +25 % | | CC_120 | 42 | **53,1** | +26 % |
| N_100 | 36 | **37,8** | +5 % | | CC_160 | 59 | **70,8** | +20 % |
| N_120 | 44 | **45,4** | +3 % | | CC_200 | 72 | **89,3** | +24 % |
| N_160 | 70 | **65,1** | −7 % | | CC_250 | 90 | **111,6** | +24 % |
| N_200 | 82 | **81,4** | −1 % | | CC_300 | 120 | **138,7** | +16 % |
| N_250 | 102 | 102 | — | | CC_350 | 150 | **161,8** | +8 % |
| N_300 | 122 | 122 | — | | R_80 | 35 | 35 | — |
| BD_115 | 33 | **37,7** | +14 % | | **R_90** | *Platzhalter 40* | **41,2** | ✔ geklärt |
| BD_135 | 40 | **44,3** | +11 % | | R_100 | 45 | **45,8** | +2 % |
| BD_150 | 48 | **49,2** | +3 % | | R_300 | 135 | **145,4** | +8 % |
| BD_170 | 56 | **55,8** | −0 % | | | | | |
| BD_200 | 64 | **65,6** | +2 % | | **Banner:** | | | |
| BD_250 | 84 | **83** | −1 % | | CC_*_BAN | | +7 bis +14 % | |
| BD_300 | 102 | **99,6** | −2 % | | BD_*_BAN | | unverändert | |
| BD_350 | 128 | **118** | −8 % | | N_250_BAN | 150 | **170** | +13 % |
| | | | | | N_300_BAN | 200 | **210** | +5 % |

**Der letzte Platzhalter (R_90) ist damit aufgelöst** — `isPlaceholder` kann entfallen.

---

## 3. Banner-Naturpapier: Klärung umgesetzt

- **`N_100_BAN` entfällt** — laut Liste „nicht lieferbar" (Spalte F = N/A). Das war unser
  zweiter Platzhalter.
- **`N_80_BAN` neu** — 80g Natur BANNER, **60 €**/1000 (Format 690 × 330 mm).
  Achtung: Der alte Platzhalterpreis für „80g Natur BANNER" war 90 € — der neue ist
  **niedriger** (60 €).
- **`N_120_BAN` neu** — 120g Natur Banner, **90 €**/1000, Format **690 × 315 mm**
  (abweichend von den übrigen Bannerbogen — nur relevant, falls wir Bogenmaße je Papier
  führen wollen; aktuell tun wir das nicht).

Damit ändert sich die Banner-Inhaltsliste: `CC_120_BAN, CC_160_BAN, BD_135_BAN` plus
**`N_80_BAN`, `N_120_BAN`** statt `N_100_BAN`.

---

## 4. Neue GC-Verarbeitungstabelle (125 geänderte Zellen)

Alle 11 Bogenteile-Zeilen (2–12) und alle Staffeln 2–500 sind betroffen; die Staffel 1
bleibt unverändert (5/10/15/20 €). Steigerung **+3,4 bis +26,2 %**, im Mittel **+17,4 %**,
mit den größten Sprüngen bei hohen Bogenteilen und großen Auflagen.

Beispiele (Bogenteile 12 = 48 Seiten): Auflage 10 42 → **53** (+26 %),
Auflage 100 85 → **106,50** (+25 %), Auflage 500 128,20 → **158,50** (+24 %).

**Struktur unverändert:** Zeilen 2–12 (max. 48 Seiten), Staffeln 1–500. Die
Spaltenüberschriften gehen in der Excel zwar bis 1000, sind aber ab 600 leer — GC bleibt
also bei **maximal 500 Exemplaren**, passend zu unserer Config.

**Auswirkung auf Endpreise** (neue Papierpreise **und** neue GC-Tabelle zusammen):

| Referenzfall | alt | neu | Δ |
|---|---|---|---|
| A4 Hoch, 100 Ex., 24 S., 4/4, CC120, ohne U | 261,43 | 279,08 | +6,8 % |
| A4 Hoch, 300 Ex., 32 S., 4/4, CC120+CC300, matt | 1088,24 | 1156,80 | +6,3 % |
| A4 Hoch, 1 Ex., 20 S., 1/1, N80, ohne U | 22,75 | 22,92 | +0,7 % |
| A5 Hoch, 50 Ex., 16 S., 1/1, N90, ohne U | 64,17 | 67,33 | +4,9 % |
| A6 Hoch, 100 Ex., 24 S., 4/4, CC120, ohne U | 121,47 | 131,73 | +8,4 % |
| A4 Hoch, 500 Ex., 48 S., 4/4, BD115, ohne U | 1668,63 | 1739,33 | +4,2 % |
| A4 Hoch, 200 Ex., 64 S., 4/4, BD115 (Partner) | 1035,92 | 1057,75 | +2,1 % |

**Keine Routenwechsel** — in 1139 Stichproben bleibt die empfohlene Produktion identisch
(0,0 %). Die GC-Erhöhung verschiebt also nicht die Make-or-Buy-Grenze; die Kleinmengen-
Zielpreise (≈ 25/30/35 €) bleiben ebenfalls eingehalten.

---

## 5. Laufrichtung & Verfügbarkeit — eine echte Korrektur

Die neue Liste sagt pro Sorte, in welcher Laufrichtung sie beschaffbar ist, und leitet
daraus ab, für welche Formatgruppe sie taugt (BB → nur A6H/A5Q/A4H, SB → nur A5 Hoch,
beide → alle). Abgleich mit unseren Zulässigkeitslisten:

- **Bestätigt:** R_90 nur A5 Hoch ✓; N_100/N_200/N_300/CC_300/CC_350/R_80/R_100 nicht für
  A5 Hoch ✓ — unsere Listen stimmen hier bereits.
- **Eine Abweichung:** **`R_300` ist Breitbahn und damit für A5 Hoch nicht lieferbar** —
  steht bei uns aber als Umschlagpapier für A5_Hoch drin. **→ entfernen.**
  Konsequenz: Bei A5 Hoch gibt es dann für Recycling-Inhalt (R_90) **keinen zulässigen
  Umschlag mehr** (Familienregel), Recycling ist dort also nur ohne Umschlag bestellbar.
  Für den Leadprint-Shop heißt das: im A5-Hoch-mit-Umschlag-Artikel bleibt die R_90-Zeile
  komplett leer.
- Die Liste führt zusätzlich alle schweren Sorten (N_160–N_300, BD_200–BD_350,
  CC_200–CC_350, R_300) als „verfügbar" — das ist reine **Beschaffbarkeit**, nicht
  „als Inhalt zugelassen". Unsere Inhaltslisten bleiben unverändert.

---

## 6. Umsetzungsplan

**Schritt 1 — Config auf 2.2.0 heben** (`src/data/pricingConfig.default.json`)
1. 30 Papierpreise aus Spalte F übernehmen; `isPlaceholder` bei **R_90** entfernen.
2. `N_100_BAN` löschen; `N_80_BAN` (60 €, 107 µm) und `N_120_BAN` (90 €, 173 µm) anlegen;
   Banner-Inhaltsliste der Formate A4_Quer und 30x30 entsprechend anpassen.
3. `wvTabellen.gc_horizon` komplett durch die V3-Werte ersetzen.
4. `R_300` aus `A5_Hoch.papiereUmschlag` entfernen.
5. `meta.version` = 2.2.0, `meta.stand` = 2026-07-30, Kommentar mit Quelle.

**Schritt 2 — Tests** (`calculateRSTPrice.test.js`): Referenzwerte aktualisieren, die auf
alten GC-Preisen/Papierpreisen beruhen; neue Tests für die Kleinmengen-Zielpreise, für
R_90-ohne-Umschlag bei A5 Hoch und für die neuen Bannerpapiere.

**Schritt 3 — Referenz-Export neu erzeugen** (`RST-Rechner-Export.md`) mit den neuen
Zahlen, als Kontrollgrundlage für Guidos angekündigte Tests.

**Schritt 4 — Produktiv veröffentlichen:** Die Live-App zieht ihre Config aus dem
geteilten Stand (Vercel Blob). Nach dem Deploy in der **Verwaltung** „Auf Standard
zurücksetzen" und **veröffentlichen** — sonst rechnet der Rechner online weiter mit den
alten Preisen. (Dasselbe gilt für die noch nicht veröffentlichte ILDA-500-Änderung aus
2.1.1.)

**Schritt 5 — Leadprint-Preisvorschau neu generieren** (`Leadprint-Preisvorschau.xlsx`),
damit die Shop-Preise auf dem neuen Stand basieren. Am Mapping selbst ändert sich nichts
außer: Banner-Papiere (Phase 2) bekommen andere IDs, und im A5-Hoch-mit-Umschlag-Artikel
entfällt die R_90-Kombination.

Durch die Matrix-Entscheidung gibt es keine Abhängigkeiten mehr — **alle fünf Schritte
können direkt nacheinander umgesetzt werden.** Die verbleibenden Fragen (Kap. 7) sind
Bestätigungen bzw. Später-Themen und blockieren nichts.

---

## 7. Verbleibende Punkte (blockieren nichts)

> Die ursprünglich hier geführten Fragen zu den beiden Data_GC-Matrizen
> (Seitenlimits je Papier, Inhalt×Umschlag-Kombinationen) sind durch die
> Entscheidung vom 30.07. erledigt: **Matrizen werden ignoriert, Dickenformel und
> Familienregel bleiben.** Falls Guido beim Testen andere Seitenlimits oder
> Kombinationsregeln erwartet, ist das der wahrscheinlichste Grund für
> Abweichungen — dann gezielt nachfragen.

**7.1 Blatt BERECHNUNG** rechnet mit anderen Größen als unsere Engine: fester Zuschuss
(5 Bogen Inhalt / 3 Bogen Umschlag) statt Makulaturformel, flache Klickpreise
(Inhalt 0,10/0,20 €, **Umschlag 0,25/0,50 €** — bei uns gibt es keinen erhöhten
Umschlag-Klick), keine Deckungsbeitragsfaktoren und **keine Setup-Kosten**
(Beispiel: 5,57 € statt unserer ~22 € für 1 Ex./8 S./N80). Die 0,20 € entsprechen
ungefähr unserem *effektiven* Kleinmengen-Klickpreis (0,04 × DB-Faktor ≈ 0,19), bei
großen Auflagen liegt unsere Kurve aber deutlich darunter. Vermutung: Das ist Guidos
**Selbstkosten-/Plausibilitäts**-Gegenrechnung, unsere Engine liefert den
**Verkaufspreis** inkl. DB und 15 € Setup. **Fragen zur Bestätigung:** Bleiben
Setup-Kosten (15 €), Makulaturformel und DB-Faktoren unverändert? Und soll der Umschlag
künftig einen eigenen (höheren) Klickpreis bekommen, wie das Blatt andeutet?

**7.2 Freie Formate.** Blatt BERECHNUNG listet drei „bis"-Formate (freie Größeneingabe):
„freies Format > A5 < A4 **Hochformat**" (bis A3 offen, Nutzen 1, Bemerkung
„Worst-Case-Berechnung" → Preis wie A4 Hoch), „… **Querformat**" (bis 594 × 210) und
„freies Format **bis 30 × 30 cm**" (600 × 300). Die beiden letzten decken sich geometrisch
mit unseren Banner-Formaten A4_Quer/30x30 (nur ILDA), neu wäre das freie Hochformat.
**Frage:** Sollen freie Formate in Rechner und Shop angeboten werden (Leadprint kann
freie Maßeingabe), und gilt dann durchgängig „Preis = nächstgrößeres Standardformat"?
Wenn ja → eigene Phase nach dem Standard-Rollout, zusammen mit Banner.
