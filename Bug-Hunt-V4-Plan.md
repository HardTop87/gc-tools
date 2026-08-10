# Bug-Hunt V4 — Plan und Befunde

> Stand: 2026-08-03 · Basis: `main` @ `8caa1c2` (Merge PR #1, UI-Redesign + Aufräumen)
> Vorgänger: Bug-Hunt V3 (`eb0b3d5`, Schwerpunkt Mapper/Doku)

Dieser Bug-Hunt geht über **die gesamte App**, nicht nur über das frische Redesign.
Er ist bewusst breit angelegt, weil seit V3 zwei Dinge passiert sind: das Preis-Update
V3 (Config 2.2.0) und der komplette UI-Umbau — beides berührt Code, der vorher als
stabil galt.

---

## 1. Ziel

Fehler finden, die im Betrieb **falsche Preise**, **Datenverlust** oder **blockierte
Abläufe** verursachen. Nicht Ziel: Geschmacksfragen, Refactorings, Stil.

Priorisierung der Befunde:

| Schwere | Bedeutung |
| --- | --- |
| **Kritisch** | Falscher Preis nach außen, verlorene/überschriebene Daten, App unbenutzbar |
| **Hoch** | Falsche Anzeige mit Entscheidungsrelevanz, Ablauf bricht ab, stille Fehlbedienung |
| **Mittel** | Irreführend oder unbequem, aber korrigierbar; Randfall mit realem Auslöser |
| **Niedrig** | Kosmetik, theoretischer Randfall, Aufräumen |

## 2. Methode

Für jeden Bereich:

1. **Lesen** — Datei vollständig, nicht nur die geänderten Stellen.
2. **Repro konstruieren** — konkrete Eingaben/Zustände, die den Fehler auslösen.
   Ein Befund ohne Repro ist eine Vermutung und wird als solche markiert.
3. **Gegenprüfen** — wo möglich mit einem Testlauf (`vitest`), sonst durch
   Nachvollziehen der Datenflüsse im Code.
4. **Notieren** mit Datei:Zeile, Auslöser, Auswirkung, Vorschlag.

Was ausdrücklich **nicht** angefasst wird, solange es nicht der Befund selbst ist:
`src/utils/calculateRSTPrice.js` (Rechenlogik, getestet), `src/data/*`, `src/context/*`.

## 3. Bereiche und Prüfpunkte

### A — Redesign-Regressionen (höchstes Risiko, weil frisch und live)

- **Rechner:** Live-Berechnung per `useMemo` — rechnet sie bei *jeder* relevanten
  Änderung neu? Gibt es Zustände, in denen die Tabelle Werte einer alten Config zeigt?
- Abhängige Felder (Formatwechsel → Papiere, Inhaltspapier → Umschlagfamilie,
  Umschlag ohne CC/BD → Cello „ohne“): greifen die Effekte noch, wenn zwischendurch
  eine neue Config vom Server kommt?
- **Diff-Chips:** Vergleich gegen die empfohlene Route. Was passiert, wenn die
  empfohlene Route einen Fehler hat oder gar keine Route möglich ist?
- **Zebra/Gruppen:** Zählt die Zebra-Logik über Gruppen hinweg korrekt, auch wenn
  optionale Zeilen (Umschlag-Zuschlag, Express) wegfallen?
- **Statuszeile:** stützt sich auf `results[0]` (GC). Was, wenn GC fehlschlägt, andere
  Routen aber rechnen?
- **Verwaltung:** Bereich/Tab-Zustand bei Config-Wechsel; „Weitere“-Gruppe; die neu
  editierbaren Felder (`gewichtszuschlaege`, `cello.arten[].stueckpreis`) —
  landen Änderungen wirklich im veröffentlichten Stand?
- **Papierfilter:** Index-basierte Updates bei gefilterter Liste — schreibt eine
  Preisänderung auf das *richtige* Papier?
- **PayPal/Rhaetia:** Header-Umbau — sind Funktionen verlorengegangen (Reset,
  Zurück-Navigation, Dateinamen-Anzeige)?
- **TopBar/Routing/Auth:** Sichtbarkeit vor Login, aktive Zustände, Logout.

### B — Preis-Engine (`calculateRSTPrice.js`)

- Randfälle: Auflage 0/negativ/riesig, Seiten nicht durch 4 teilbar, Seiten < 8,
  fehlendes Umschlagpapier bei `hasUmschlag`.
- Interpolation zwischen Staffeln: unter der kleinsten und über der größten Staffel.
- `pickRecommendedRouteName`: Verhalten bei genau einer gültigen Route, bei
  Gleichstand, bei fehlendem `preferDeltaRef`.
- Rundung/Akkumulation: Wo entstehen Cent-Abweichungen gegenüber Guidos Tabelle?

### C — Config-Pipeline (`pricingConfig.js` + `api/config.mjs`)

- **Validierung:** Was lässt `validatePricingConfig` durch, das die Engine bricht?
  (z. B. Route ohne `formate`, WV-Tabelle mit Lücken in den Staffeln, `cello.arten`
  ohne Preise, negative Zuschläge.)
- **Optimistic Concurrency:** `baseRev`-Fluss Client → Server → Client. Gibt es einen
  Pfad, auf dem eine fremde Änderung still überschrieben wird?
- **Offline/Pending:** `setPendingPublish` → Reload → erneutes Veröffentlichen.
  Kann ein veralteter Pending-Stand einen neueren geteilten Stand überschreiben?
- **Auth:** `x-gc-auth` gegen `VITE_APP_PASSWORD`; Verhalten ohne gesetzte Env.
- **Import:** CSV/XLSX-Parsing, `parseFlexibleNumber` mit deutschen/englischen Zahlen,
  unbekannte IDs, teilweise gefüllte Spalten.

### D — Leadprint-Mapper (`leadprintMapper.js`)

- Deckt der Mapper alle Kombinationen ab, die der Rechner erlaubt?
- Was passiert bei Papieren/Formaten, die es in der Config, aber nicht im Mapping gibt?

### E — PayPal-Reconciliation (`PayPalExport.jsx`)

- Exklusivität der Datensätze (Matches / unmatched Shop / unmatched PayPal) über
  manuelle Zuordnung, Trennen und Reset hinweg.
- Beträge: Rundung, Vorzeichen, Gebühren; Kassensturz-Differenz.
- Export: enthält er wirklich nur verifizierte Matches?

### F — Rhaetia-Post-Manager (`PostVersand.jsx`)

- Neue Schritt-Navigation: Sprünge zurück/vorwärts ohne Datenverlust?
- Porto-/Gewichtslogik, Teillisten-Aufteilung, CSV-Encoding und Trennzeichen.

### G — Querschnitt

- **Auth:** `gc_auth` in localStorage — was schützt das tatsächlich, was nicht?
- **Zahlformate:** deutsche Formatierung, `tabular-nums`, Nachkommastellen laut
  Handoff (Preise 2, €/Stück 4, DB 3).
- **Fehlerpfade:** Was sieht der Anwender, wenn `/api/config` 500 liefert, der Blob
  ungültiges JSON enthält, oder localStorage gesperrt ist (Privat-Modus)?
- **Build/Deploy:** `vercel.json`-Rewrites vs. `/api/*`, Bundle-Größe, Env-Variablen.

### H — Test- und Doku-Abgleich

- Decken die Tests die V3-Preise ab, oder prüfen sie noch alte Referenzwerte?
- Stimmen die Zahlen in `RST-Rechner-Export.md` mit der aktuellen Engine überein?

## 4. Ergebnis

Befunde werden unten in Abschnitt 5 gesammelt, sortiert nach Schwere, jeweils mit
Repro und Vorschlag. Fixes erfolgen **nicht** im selben Durchgang — erst die
vollständige Liste, dann die Entscheidung, was davon behoben wird.

---

## 5. Befunde

Durchlauf am 2026-08-03. Grundlage: vollständiges Lesen von `App.jsx`, allen fünf Seiten,
`TopBar.jsx`/`PageHeader.jsx`/`ThemeToggle.jsx`, `pricingConfig.js`, `calculateRSTPrice.js`,
`api/config.mjs` plus Messreihen gegen die Engine (Randfälle Auflage/Seiten, Staffelgrenzen,
Abgleich der Doku-Referenzwerte).

**Alle Befunde sind reproduziert, keiner ist eine Vermutung.** Ausnahmen sind als
„zu klären" markiert — dort ist der Code eindeutig, aber die fachliche Absicht nicht.

### B1 — Kritisch: Kopp rechnet oberhalb 1000 Ex. mit eingefrorener Verarbeitung

`src/utils/calculateRSTPrice.js:121` · Route `kopp` in `pricingConfig.default.json`

Kopp ist die einzige Route **ohne `maxAuflage`** (GC und ILDA sind auf 500 begrenzt).
Die WV-Tabelle `kopp` endet bei der Staffel 1000. Oberhalb der größten Staffel gibt
`getPriceFromTable` den letzten Staffelpreis flach zurück (`return row[keys[keys.length - 1]]`)
— es wird **nicht** extrapoliert und **nicht** abgelehnt.

Messreihe (A4 Hoch, 24 Seiten, CC 120, ohne Umschlag):

| Auflage | Verarbeitung | Gesamt | € / Stück |
| --- | --- | --- | --- |
| 500 | 145,00 € | 1.090,26 € | 2,1805 |
| 1.000 | 176,00 € | 1.982,36 € | 1,9824 |
| 2.000 | **176,00 €** | 3.650,48 € | 1,8252 |
| 5.000 | **176,00 €** | 8.483,43 € | 1,6967 |
| 20.000 | **176,00 €** | 31.559,13 € | 1,5780 |

Bei 20.000 Ex. steckt in einem 31.559-€-Angebot eine Verarbeitung von 176 € — der
Verarbeitungsanteil geht faktisch gegen null. Das Angebot ist zu billig, und zwar ohne
jeden Hinweis in der Oberfläche.

**Auslöser im Alltag:** jede Kopp-Anfrage über 1.000 Ex. Das ist keine Exotik — Kopp ist
gerade die Partnerroute für größere Auflagen.

**Entschieden (Armin, 05.08.2026):** `maxAuflage: 1000` für Kopp — laut Guidos Matrix
geht Kopp nur bis 1.000 Ex., ILDA bis 500; darüber ist keine Kalkulation möglich.
Umsetzung im Config-Paket von RST-Update V4 (Version 2.3.0, siehe
`RST-Update-V4-Plan.md` Kap. 5); die bestehende Fehlermeldung greift dann automatisch.

### B2 — Hoch: Ungültiger geteilter Preisstand wird im Rechner nicht gemeldet

`src/pages/Rechner-RST.jsx:115` und `:143`

`fetchSharedConfig` unterscheidet vier Fälle. Der Rechner wertet nur `'error'` aus:

```js
setConfigStale(result.source === 'error');
```

Liefert der Server einen **ungültigen** Stand (`source: 'invalid'`, z. B. nach einem
kaputten Config-Import oder einem halb geschriebenen Blob), passiert dreierlei:
`result.config` ist `null`, die Config bleibt auf dem alten Cache-Stand, und
`configStale` wird auf **false** gesetzt. Der Anwender rechnet mit veralteten Preisen und
sieht **kein** Warnbanner — die Verwaltung zeigt in diesem Fall eine Fehlermeldung, der
Rechner nichts.

**Repro:** in der Verwaltung eine Config mit fehlendem `settings`-Key veröffentlichen
(der Server prüft nur grob, `looksLikeConfig` in `api/config.mjs:32` sieht keine
Settings-Keys) → Rechner öffnen → alte Preise, keine Warnung.

**Vorschlag:** `setConfigStale(result.source === 'error' || result.source === 'invalid')`
und im Banner zwischen „nicht erreichbar" und „geteilter Stand ist ungültig" unterscheiden.

### B3 — Hoch: Liegengebliebene Änderung überschreibt fremde Veröffentlichungen

`src/pages/Verwaltung.jsx:222` und `:238–242`

Beim Öffnen der Verwaltung passiert der Reihe nach:

1. geteilten Stand laden, `loadedRevRef.current = configRev(result.config)` → **aktuelle** Revision
2. `getPendingPublish()` — eine Änderung, die früher offline nicht rausging
3. falls vorhanden: `setConfig(pending)` und sofort `schedulePublish(pending, 0)`

Veröffentlicht wird also der alte Pending-Stand mit `baseRev` = **der frisch geladenen
Revision**. Die Konfliktprüfung des Servers (`api/config.mjs:78`) vergleicht genau diese
beiden Werte — sie passen, der Server nimmt an. Die Revision, auf der der Pending-Stand
tatsächlich beruhte, wird nirgends geprüft.

**Repro:** Armin ändert einen Papierpreis, während das Netz weg ist (Pending bleibt
liegen, Warnung erscheint). Guido veröffentlicht am nächsten Tag zehn neue Preise.
Armin öffnet die Verwaltung → Armins alter Stand wird über Guidos zehn Änderungen
veröffentlicht, mit der grünen Meldung „wird erneut veröffentlicht". Guidos Arbeit ist
weg, niemand erfährt es.

**Vorschlag:** vor dem Auto-Publish `configRev(pending)` gegen die geladene Revision
halten. Bei Gleichstand wie bisher weiterlaufen lassen; bei Abweichung nicht automatisch
veröffentlichen, sondern fragen („Dein Stand von … oder der aktuelle geteilte Stand?").

### B4 — Hoch: Leere oder unsinnige Eingaben liefern still einen Preis

`src/utils/calculateRSTPrice.js:455–456`, sichtbar durch die Live-Berechnung im Rechner

```js
auflage: parseInt(formValues.auflage, 10) || 1,
seiten:  parseInt(formValues.seiten, 10) || 8,
```

Gemessen:

| Eingabe | Gerechnet mit | Angezeigt |
| --- | --- | --- |
| Seiten leer | 8 Seiten | 115,48 € (GC) |
| Seiten `0` | 8 Seiten | 115,48 € (GC) |
| Auflage leer / `abc` | 1 Ex. | 32,09 € (GC) |
| Auflage `12,5` | 12 Ex. | 73,91 € (GC) |

Vor dem Redesign musste man „Preis berechnen" drücken, jetzt steht das Ergebnis
permanent und selbstbewusst in der Vergleichstabelle. Wer das Feld leert, um eine neue
Zahl zu tippen, sieht dazwischen einen vollständigen, plausiblen — und falschen — Preis.
Ein abgeschriebener Zwischenstand landet im Angebot.

**Vorschlag:** leere/ungültige Pflichtfelder erkennen und statt der Tabelle einen
Hinweis zeigen („Auflage und Seitenzahl eingeben"). Die Engine selbst nicht anfassen.

### B5 — Mittel: Seitenzahl ohne Vielfaches von 4 erzeugt eine irreführende Fehlermeldung

`src/utils/calculateRSTPrice.js:224` und `:369`

`bogenteile = seiten / 4` — bei Seiten = 10 sind das 2,5 Bogenteile, die WV-Tabelle kennt
nur ganze Zeilen. Alle drei Routen melden:

> „Auflage/Umfang bei GC (Horizon) nicht in Preistabelle hinterlegt."

Dasselbe bei Seiten = 4 (unter dem Minimum von 8). Der Anwender sucht den Fehler bei der
**Auflage**, obwohl es an der **Seitenzahl** liegt. Das Feld hat zwar `min=8 step=4`,
das gilt im Browser aber nur für die Pfeiltasten, nicht fürs Tippen.

**Vorschlag:** vor der Routenberechnung prüfen und eine klare Meldung ausgeben
(„Seitenzahl muss ein Vielfaches von 4 und mindestens 8 sein").

### B6 — Mittel: Statuszeile des Rechners spricht nur für GC

`src/pages/Rechner-RST.jsx:153, 166–173`

`techLine` und `maxSeitenLabel` lesen `results[0]` — das ist immer GC (Horizon), die erste
Route der Config. Scheitert GC, während Kopp und ILDA rechnen (Auflage 501, oder eine
Papierkombination über der GC-Dickengrenze), steht unter der Eingabeleiste:

> „Kombination bei GC (Horizon) nicht möglich · max. — Seiten bei dieser Papierkombination"

… während die Tabelle daneben zwei gültige Preise zeigt. Die genannte Seitengrenze ist
außerdem die von GC (56), nicht die der Route, die tatsächlich produziert (92).

**Vorschlag:** die Statuszeile auf die **empfohlene** Route stützen, hilfsweise auf die
erste gültige; nur wenn gar keine Route möglich ist, den Fehlerhinweis zeigen.

### B7 — Mittel: Abgelehnte Zahleneingaben verschwinden kommentarlos

`src/pages/Verwaltung.jsx:126–133`

`NumberField` committet nur, wenn `parsed >= min` und `parsed !== value`. Wer in eine
WV-Zelle oder ein Papierpreisfeld `0` schreibt (`min: 0.001`), sieht beim Verlassen des
Feldes wieder den alten Wert — ohne Meldung. Das ist als Schutz gedacht, wirkt aber wie
ein hakendes Formular; bei einem Preis, den man bewusst auf 0 setzen will, steht man an.

**Vorschlag:** abgelehnte Eingabe kurz markieren (roter Rand + Tooltip mit dem Grund),
statt sie stillschweigend zurückzudrehen.

### B8 — Niedrig: Object-URLs im Rhaetia-Export werden nie freigegeben

`src/pages/PostVersand.jsx` (`downloadCSV`)

Pro Teilliste werden zwei `URL.createObjectURL(...)` erzeugt und nie mit `revokeObjectURL`
freigegeben; die Begleitlisten-Downloads laufen zusätzlich über `setTimeout(..., 500)`,
was bei mehreren Teillisten gleichzeitig feuert. Folge: Speicher bleibt bis zum
Seitenwechsel belegt, bei vielen Teillisten können Downloads vom Browser gebündelt
blockiert werden. Kein Datenfehler.

### B9 — Niedrig, bekannt: Der Passwortschutz ist keiner

`src/App.jsx` (Login gegen `VITE_APP_PASSWORD`), `src/utils/pricingConfig.js:183`,
`api/config.mjs:11`

Das Passwort liegt im Client-Bundle (`import.meta.env.VITE_APP_PASSWORD`) und wird als
`x-gc-auth`-Header an die API geschickt; der Login-Status steht als `gc_auth` in
localStorage. Wer das Bundle liest, kann die komplette Preisbasis abrufen **und
veröffentlichen**. Der Code sagt das in den Kommentaren selbst — es ist eine bewusste
Entscheidung, gehört aber in diese Liste, weil es die einzige Zugangshürde ist.
Fällt nur ins Gewicht, falls die Kalkulationsgrundlage als vertraulich gilt.

### Zu klären (kein Befund, sondern eine Frage an die Fachlichkeit)

- **Teilzahlung „Rest Bar" im PayPal-Abgleich** (`makeMatchedRecord`, `liveStats`):
  Nach einer Teilzahlung verlässt der Shop-Auftrag die offene Liste vollständig, gezählt
  wird nur der PayPal-Betrag. Für den PayPal-Kassensturz ist das stimmig; wenn die Zahl
  aber als „Umsatz laut Shop" gelesen wird, fehlt der bar bezahlte Rest. Bitte einmal
  bestätigen, welche Lesart gilt.
- **Ausgeschlossene Shop-Aufträge** („Fehlt in PayPal"): Sie verschwinden aus der
  Klärungsliste, zählen aber weiter in `openShopTotal` und damit im Live-Stand. Gewollt?

### Ohne Befund geprüft

- **Doku-Abgleich:** Die Referenzwerte in `RST-Rechner-Export.md` (A4 Hoch, 100 Ex.,
  24 Seiten, CC 120) stimmen auf den Cent mit der aktuellen Engine überein —
  279,08 / 342,58 / 338,98 €. Guido kann direkt dagegen testen.
- **Papierpreis-Bearbeitung bei aktivem Filter:** Die Verwaltung merkt sich den Index in
  `config.papiere`, bevor gefiltert wird — eine Preisänderung trifft das richtige Papier,
  auch bei aktiver Suche.
- **Abhängige Felder im Rechner:** Formatwechsel → Papierauswahl, Inhaltspapier →
  Umschlagfamilie, Umschlag ohne CC/BD → Cello „ohne" greifen unverändert.
- **Diff-Chips und Zebra:** Zählung über Gruppen hinweg korrekt, optionale Zeilen
  (Umschlag-Zuschlag, Express) verschieben sie nicht; ohne gültige Empfehlung erscheinen
  gar keine Chips statt falscher.
- **Exklusivität im PayPal-Abgleich:** Beim manuellen Zuordnen wandern Datensätze
  atomar aus beiden offenen Listen in die Matches — keine Doppelzählung.
- **Optimistic Concurrency im Normalfall:** Konflikt → 409 → Neuladen → klare Meldung;
  der Pfad ist sauber. Die Lücke steckt ausschließlich im Pending-Fall (B3).
- **TopBar/Routing:** vor dem Login unsichtbar, aktive Zustände korrekt, Logout räumt
  `gc_auth` und den Auth-State ab.

---

## 5b. Zweiter Durchgang: Bereiche D, E, F in der Tiefe

Der erste Durchgang hat Leadprint-Mapper, PayPal-Innenleben und die Rhaetia-Porto-/
CSV-Logik nur gestreift. Nachgeholt am 2026-08-05, Code unverändert (`main` @ `8caa1c2`).

### D1 — Hoch: 37 % der Shop-Stützstellen sind nicht kalkulierbar

`src/utils/leadprintMapper.js:26–44`

Der Mapper erzeugt je Artikel eine Preiszeile aus Basispreis (8 Seiten) plus additiven
Aufschlägen für 29 Seiten-Stützstellen (8 … 120). Oberhalb der papierabhängigen
Dickengrenze gibt es keine Route mehr — der Aufschlag ist dann `null`.

Gemessen für den Artikel **A4 Hoch, 4/4, ohne Umschlag** (13 Inhaltspapiere ×
6 Auflagen = 78 Preiszeilen):

| Kennzahl | Wert |
| --- | --- |
| Preiszeilen mit Lücken | **78 von 78** |
| nicht kalkulierbare Stützstellen | **798 von 2.184 (37 %)** |

Beispiel CC 120 / 100 Ex.: ab 80 Seiten gibt es keinen Preis mehr; die Stützstellen
80 – 120 sind leer.

**Entwarnung zur Auswirkung:** Leadprint blendet Optionen ohne Zellpreis im Frontend aus
(bestätigt 2026-07-07) — eine leere Zelle verkauft also nichts, sie versteckt die Option.
Der Fehlerfall wäre nur, wenn der Import-Writer `null` als **0** schreibt statt die Zelle
leer zu lassen. Damit ist das kein Live-Risiko, sondern eine **Anforderung an den noch zu
bauenden Writer**.

**Entscheidung (Armin, 2026-08-05):** Der Writer baut ausschließlich Kombinationen mit
echtem Preis; nicht kalkulierbare Stützstellen bleiben leer und werden dadurch im Shop
ausgeblendet. Beim Bau des Writers ist das explizit zu testen — ein Artikel mit dickem
Papier zeigt es sofort (37 % der Zellen müssen leer bleiben, nicht 0 sein).

### D2 — Hoch: Routenwechsel erzeugen Preissprünge bis 257 € im Shop

`src/utils/leadprintMapper.js:16–19`

`preis()` nimmt immer die **empfohlene** Route. Die kann sich über die Seiten-Stützstellen
hinweg ändern — typischerweise fällt GC an seiner Dickengrenze (1500 µm) raus, während
die Partner (2500 µm) weiterlaufen. Der Aufschlag zwischen zwei Stützstellen enthält dann
nicht nur vier Seiten mehr, sondern den kompletten Routenwechsel.

Im selben Artikel: **97 Routenwechsel** innerhalb der 78 Preiszeilen, unter anderem

| Zeile | Wechsel | Sprung |
| --- | --- | --- |
| CC 100 / 500 Ex. | GC → Kopp ab 52 S. | **+257,35 €** |
| CC 100 / 10 Ex. | GC → Kopp ab 52 S. | +185,16 € |
| CC 120 / 10 Ex. | GC → Kopp ab 48 S. | +159,52 € |
| CC 120 / 100 Ex. | GC → ILDA ab 48 S. | +56,53 € |

**Kein Rechenfehler.** Jeder Aufschlag ist eine direkte Preisdifferenz zweier vollständig
gerechneter Preise, die additive Kombination ist deshalb exakt — auch über einen
Routenwechsel hinweg (verifiziert 2026-07-07 zellgenau gegen `RST-Rechner-Export.md`).
Der Kommentar im Mapper, der die Verrechnung noch „Annahme" nennt, ist damit veraltet.
Was bleibt, ist ein **kaufmännisches** Thema: eine Preisklippe von 257 € zwischen 48 und
52 Seiten im Shop-Frontend.

In der Auflagen-Dimension ist dasselbe Phänomen bereits abgefangen — durch die
Grenzstaffeln 99 und 501 in `leadprintMapping.rst.json` (max. Abweichung −2,80/+12,80 €).
Für die Seiten-Dimension gibt es das noch nicht.

**Status (2026-08-05): zurückgestellt.** Guido spricht den Preissprung in seiner neuen
Mail selbst an und schlägt eine Abfederung vor. Wird später behandelt — der Vorschlag
liegt mir noch nicht vor.

### E1 — Hoch, steuerlich zu klären: 0 % MwSt landet auf dem 19-%-Konto

`src/pages/PayPalExport.jsx` (`getGegenkontoFromMwst`)

```js
if (isManual) return '8405';
if (mwstRate === 19) return '8405';
if (mwstRate === 7)  return '8305';
return '8405';           // ← alles andere, auch 0 %
```

`parseMwstRate` liefert 0, wenn im Shop-Export weder 19 noch 7 steht — also bei
innergemeinschaftlichen Lieferungen mit USt-ID, bei Drittland-Lieferungen und schlicht
bei leerer Spalte. Diese Buchungen gehen mit **Gegenkonto 8405 (Erlöse 19 %)** in den
DATEV-Export, während in derselben Zeile `MwSt-Satz: 0` und ggf. eine USt-ID stehen.

Ich kenne euren Kontenrahmen nicht und bewerte das deshalb nicht abschließend — aber die
Kombination „Konto 19 %, Satz 0 %" ist genau die Art Widerspruch, die beim Steuerberater
auffällt. Bitte einmal klären, welches Konto für 0-%-Erlöse gilt, und ob ein fehlender
Wert überhaupt still als 0 durchlaufen darf oder als Klärfall gemeldet werden sollte.

### E2 — Niedrig: Stage-2-Zuordnung nimmt den ersten Treffer

`src/pages/PayPalExport.jsx` (`runMatching`, Stage 2)

Stage 2 matcht über „PayPal-Name enthält Nachnamen aus dem Shop" **und** exakten Betrag,
und nimmt den **ersten** passenden Datensatz. Zwei Kunden mit gleichem Nachnamen und
gleichem Betrag im selben Zeitraum können vertauscht werden — die Summen stimmen dann,
die Belegzuordnung nicht. Das ist der Preis einer Heuristik und durch die Klärungs-Station
abgefedert; erwähnenswert bleibt, dass ein Stage-2-Treffer in der Oberfläche nicht als
„unsicher" gekennzeichnet ist, obwohl `matchType` es weiß.

### F1 — Mittel: Sonderzeichen werden im Rhaetia-CSV still zu „?"

`src/pages/PostVersand.jsx` (`encodeWindows1252`)

Rhaetia bekommt Windows-1252. Alles außerhalb dieses Zeichensatzes wird durch `?` ersetzt
— polnische, tschechische oder türkische Namen (ł, ř, ş, ğ) landen so verstümmelt auf dem
Etikett. Technisch unvermeidbar bei Windows-1252, **aber der Anwender erfährt es nicht**.

**Vorschlag:** beim Export zählen, in wie vielen Datensätzen ersetzt wurde, und das in der
Vorschau anzeigen („3 Adressen enthalten Zeichen, die Rhaetia nicht darstellen kann").

### F2 — Mittel: `toCsvCell` löscht Zeichen ersatzlos

`src/pages/PostVersand.jsx` (`toCsvCell`)

Anführungszeichen werden entfernt, Semikolon und Zeilenumbruch durch ein Leerzeichen
ersetzt. Bei `Firma "Muster"` oder einem Zusatz mit Semikolon verändert sich die Adresse
stillschweigend. Für ein ungequotetes CSV ist das die richtige Verteidigung — nur sollte
sie sichtbar sein, am besten zusammen mit F1 in einer Hinweiszeile.

### Zu klären (Bereich F)

- **Position auf der Begleitliste:** Die Seiten-/Positionsrechnung (`labelIndex`,
  12 Etiketten je Seite) zählt den Absender bewusst **nicht** mit, obwohl er im CSV Zeile 1
  ist. Der Code sagt das im Kommentar ausdrücklich. Falls Rhaetia den Absender doch als
  Etikett druckt, ist jede Positionsangabe um eins verschoben. Einmal an einer echten
  Lieferung gegenprüfen.

### Ohne Befund geprüft (zweiter Durchgang)

- **Portostaffeln** (`getVersandArt`): 20 / 50 / 500 / 1000 g entsprechen
  Standard-, Kompakt-, Groß- und Maxibrief; darüber Paket mit DHL-Kennzeichnung. Korrekt.
- **PLZ und Länder** (`formatPLZ`, `normalizeCountryCode`): führende Null wird nur für
  Deutschland ergänzt, vierstellige AT/CH-PLZ bleiben unangetastet; das Länder-Mapping
  deckt Schreibweisen wie „D", „Deutschland", „Germany" ab.
- **Beträge im PayPal-Abgleich:** Vergleiche laufen durchgängig über
  `hasSameAmount` mit 0,005-Epsilon statt über `===` — keine Cent-Fehler durch
  Fließkomma. `parseCurrency` verarbeitet deutsche und englische Schreibweisen.
- **Mapper-Grundlagen:** Die Familienregel wird in `computeArtikelMitUmschlag` korrekt
  angewandt, unbekannte Formate liefern eine leere Liste statt eines Absturzes, und die
  Cello-/Farbigkeits-Aufschläge sind tatsächlich unabhängig von der Seitenzahl
  (sie hängen nur an den Umschlagbögen) — die einmalige Berechnung an der Basis-Stützstelle
  ist also zulässig.

## 6. Empfohlene Reihenfolge fürs Beheben

**Zuerst anstoßen, weil eine fremde Entscheidung nötig ist** (läuft parallel zum Rest):

1. **B1** — Kopp über 1.000 Ex.: Deckel oder Extrapolation? → Guido
2. **E1** — Gegenkonto für 0-%-Erlöse → Steuerberater

**Erledigt bzw. zurückgestellt:**

- **D1** — entschieden (Armin, 2026-08-05): Writer baut nur Kombinationen mit echtem
  Preis, leere Zellen blenden die Option aus. Wandert als Testfall in den Writer-Bau.
- **D2** — zurückgestellt: Guido hat in seiner neuen Mail einen eigenen Vorschlag zur
  Abfederung des Preissprungs.

**Danach technisch abarbeiten:**

4. **B3** — ✅ erledigt 2026-08-10: Ein liegengebliebener Pending-Publish wird nur noch
   automatisch veröffentlicht, wenn seine Basis-Revision dem geladenen geteilten Stand
   entspricht (`canAutoPublishPending`); sonst fragt die Verwaltung, ob die eigene
   Änderung veröffentlicht oder verworfen werden soll.
5. **B2** — ✅ erledigt 2026-08-10: Der Rechner warnt bei `source: 'invalid'` jetzt mit
   eigenem Bannertext („geteilter Stand ungültig, es gilt der lokale Stand"), analog
   zum Offline-Fall.
   **B4** — ✅ erledigt 2026-08-10: Leere/ungültige Auflage oder Seitenzahl blockiert die
   Live-Berechnung; statt der Vergleichstabelle erscheint ein Hinweis
   („Bitte Auflage eingeben …", `rstFormInput.js`), die Engine bleibt für den
   Leadprint-Mapper unverändert.
6. **B5** — bereits mit P3 erledigt (klare Seitenzahl-Meldungen in der Engine).
   **B6** — ✅ erledigt 2026-08-10: Die Statuszeile stützt sich auf die empfohlene bzw.
   erste gültige Route und nennt deren Namen; nur ohne jede gültige Route erscheint
   der Fehlerhinweis.
   **B7** — ✅ erledigt 2026-08-10: Abgelehnte Zahleneingaben in der Verwaltung zeigen
   einen roten Rand mit Begründung als Tooltip, statt still auf den alten Wert
   zurückzufallen.
7. **F1/F2** und **B8** — ✅ erledigt 2026-08-10: Vorschau und Download-Ansicht zeigen
   eine Hinweisbox, wie viele Adressen der Export verändert (`?`-Ersetzung bzw.
   CSV-Bereinigung); Downloads laufen über einen Helfer, der Object-URLs nach dem
   Klick freigibt und mehrere Downloads staffelt.
8. **E2** — ✅ erledigt 2026-08-10: Stage-2-Treffer tragen in der Matches-Tabelle ein
   gelbes „Heuristik"-Badge samt Hinweiszeile mit Bitte um Gegenprüfung.
9. **B9** — nur, falls die Preisbasis als vertraulich eingestuft wird; dann echter
   serverseitiger Login statt Bundle-Passwort.


---

## 7. Nachtrag 10.08. — B10: 409-Schleife durch Blob-CDN-Cache (gefunden im Betrieb, gefixt)

**Symptom (Armin, 10.08.):** Beim Veröffentlichen in der Verwaltung erscheint wiederholt
„Zwischenzeitlich hat jemand anderes gespeichert", obwohl niemand sonst arbeitet; die
eigene Änderung wird verworfen und der (alte) Stand neu geladen.

**Ursache:** `readSharedConfig` in `api/config.mjs` las den Blob über `get(BLOB_PATH)` —
das lädt über die **stabile CDN-URL** des Blobs. `put` schrieb ohne `cacheControlMaxAge`,
der SDK-Default ist **ein Monat**. Nach einem erfolgreichen Publish (rev N+1) las der
Server beim nächsten POST u. U. die gecachte alte Revision N, verglichen mit der baseRev
N+1 des Clients → 409, obwohl kein echter Konflikt vorlag. Der Konflikt-Handler lud dann
denselben veralteten Stand zurück ins UI — die Änderung wirkte „verloren". Eine
Selbstverstärkung: je öfter man es erneut versucht, desto öfter der scheinbare Konflikt.

**Fix (Commit auf `bug-hunt-v4`):**
- `readSharedConfig` holt die Blob-URL jetzt autoritativ über `head()` (Blob-API, kein
  CDN) und lädt den Inhalt mit einem eindeutigen `?fresh=<timestamp>`-Query-Parameter —
  jeder Abruf ist ein eigener Cache-Key, der Server sieht immer die echte Revision.
- `put` schreibt mit `cacheControlMaxAge: 60` (SDK-Minimum) statt des Monats-Defaults.

**Einordnung zu B3:** B3 (liegengebliebener Pending-Publish überschreibt fremde Stände)
bleibt ein eigenes, echtes Problem — B10 erklärt aber, warum Konflikte bisher viel
häufiger *gemeldet* wurden, als tatsächlich stattfanden.


---

## 8. Session-Review 10.08. abends — Bug-Hunt über alle Tagesänderungen (8 Prüfwinkel, verifiziert, gefixt)

Nach Abschluss von P2/P4/P1/P3, B10 und der Bug-Fix-Runde lief ein Review über den
gesamten Tagesdiff. Bestätigte und behobene Funde (alle im selben Abend deployt):

1. **api/config.mjs — put-Fehler pauschal als 409:** Jeder Schreibfehler (Netz, Token,
   Blob-Ausfall) wurde als Konflikt gemeldet; der Client verwarf daraufhin die
   ungespeicherte Änderung. Jetzt wird autoritativ unterschieden (existiert die
   Revisionsdatei nach dem Fehler? → echter Konflikt; sonst 500 und die Änderung
   bleibt erhalten).
2. **api/config.mjs — stiller Legacy-Fallback:** Bei transient nicht lesbarer jüngster
   Revisionsdatei lieferte GET den alten Einzel-Blob als aktuellen Stand aus. Jetzt:
   Legacy nur, wenn gar keine Revisionsdatei existiert; sonst Fehler statt Uralt-Stand.
3. **api/config.mjs — POST-Revision aus dem Dateinamen** statt aus dem Blob-Inhalt
   (eliminiert das Szenario „Veröffentlichung landet als längst gelöschte
   Revisionsnummer und ist still verloren"; spart zugleich einen Blob-Roundtrip).
4. **Rechner — Tippen von „4…" aktivierte still den Umschlag** (P3-Auto-Aktivierung
   feuerte pro Tastendruck; „48" tippen → Umschlag an, Preis zu hoch). Auto-Aktivierung
   jetzt erst beim Verlassen des Felds.
5. **Verwaltung — B3-Guard umgangen bei 'error'/'invalid':** Pending-Publish wurde bei
   nicht ladbarem oder ungültigem geteilten Stand blind veröffentlicht (Datenverlust
   bzw. stilles Überschreiben). Jetzt: offline → Änderung bleibt gemerkt; ungültig →
   Nutzerentscheidung über die Konfliktbox.
6. **migratePricingConfig — kaputte Werte** (String statt Zahl) wurden still durch
   Defaults ersetzt; jetzt werden nur wirklich fehlende Schlüssel aufgefüllt, kaputte
   Werte fallen weiter laut in der Validierung auf.
7. **Rechner-Kopfzeile** nutzte weiter die stillen parseInt-Fallbacks („1 Ex."), die B4
   verbannt hatte → bei ungültiger Eingabe jetzt neutraler Text.
8. **Konsolidierungen:** Seitenzahl-Mindestregel als eine Quelle (`minSeiten` in der
   Engine), gemeinsamer Download-Helfer (`src/utils/download.js`, vorher 3 Kopien),
   Maku-Basis-Ausdrücke, `warnungFromSource`, Stage2-Zählung, PostVersand-Banner.
9. **Neuer Test:** Leadprint-Additivitäts-Eckfall (Dickenaufschlag kippt Route via
   Umschlag-Farbigkeit) sichert die Invariante „nie unter dem echten Preis".

**Bewusst offen:** Kleinmengen-Zielpreise (Entscheidung Guido, siehe P5-Vorschlag);
F1/F2-Hinweis spiegelt die Export-Pipeline statt Round-Trip (Drift-Risiko, Backlog);
B9 unverändert zurückgestellt.
