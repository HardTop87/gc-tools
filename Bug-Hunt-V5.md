# Bug-Hunt V5 — RST-Rechner, Verwaltung, API, Leadprint-Kette

Stand 12.10.2026 · Branch `leadprint-import-writer` (= main d6759f3 + uncommittete Writer-Arbeit) · 137 Tests grün, Lint sauber.
Drei unabhängige Reviews (Engine, UI/Verwaltung/API, Leadprint-Import-Kette).

**Fix-Stand 17.10.2026 (uncommittet auf `leadprint-import-writer`, 219 Tests grün, Lint und Build sauber):** gefixt sind H1, M1–M9, N1–N3, N5–N14 sowie der H2-Kommentar. **Offen** bleiben H2 (Entscheidung Routen-Tag), N4 (Route-Flags in der Migration; nur `maxAuflage: null` wird jetzt aufgefüllt), N15 (Hinweis) und U1–U4 (fachlich). Neue Dauertests: `pricingConfig.test.js` (Validierungs-Sweep) und `calculateRSTPrice.sweep.test.js` (Monotonie, Staffelgrenzen, Express), Zeitlimit 120 s wegen Systemlast.

## Kernergebnis

- **Preis-Engine rechnet korrekt.** Vollsweep über 495.080 Aufrufe (alle Formate × Farbigkeiten × Papiere × Umschlag × Cello × Seiten × Auflagen 1–5000): 0 Anomalien. Kassen-Anker 1→10 exakt, Staffelgrenzen (500/501, 9/10, 1000/1001, 99/100) sauber, kein Schema-Drift Engine ↔ Default-JSON. Lückenloser Sweep 1→1000 Ex.: nur der bekannte Makulatur-Rundungseffekt (max 0,415 €, A6 mit Umschlag, bewusst nicht gefixt).
- **Alle Engine-Befunde liegen in der Validierung**: `validatePricingConfig` lässt Stände durch (JSON-Import, Blob), die den Rechner für alle Nutzer crashen oder NaN-/String-Preise mit `error: null` liefern.
- **Verwaltung hat zwei echte Lost-Update-Pfade** (V1, V2) und einen Deep-Link-Bug (V6).
- **Leadprint-Kette technisch sauber** (zellgenau nachgerechnet, 0 Abweichungen), aber ein Design-Punkt beim Routen-Tag und ein Mapping-Fehler bei der Bindung.

## Befunde nach Priorität

### Hoch

| ID | Bereich | Befund | Stelle |
|---|---|---|---|
| **H1** | Verwaltung | Nach einem 409 wird eine während des POST eingegangene zweite Änderung mit der frisch übernommenen Revision nachveröffentlicht → überschreibt still die fremde Änderung; UI zeigt den fremden Stand, Server hat den eigenen. | `Verwaltung.jsx:381-420` — Fix: im Konflikt-Zweig `pendingConfigRef.current = null`, Nachlauf nur bei `ok`/`offline` |
| **H2** | Leadprint | Routen-Tag in `articlePrices.artikelnummer` ist Route der 8-Seiten-Basiszelle. Gemessen A4H: 1.174 von 4.305 bepreisten Zellen (27 %) tragen ein anderes Tag als ihre Engine-Route (GC→KOPP 641, GC→ILDA 533), 117 von 260 Zeilen. Kein „seltener Eckfall", sondern systematisch ab 48 S. bei Auflage ≥ 100. Ein Switch-Flow, der den Produzenten aus dem Tag liest, leitet falsch. | `leadprintWriter.js:23-26, 74, 103` — Entscheidung Armin/Guido: (a) dokumentiert als „Basiszellen-Route", (b) Tag `MIX` bei gemischten Zeilen, (c) `/api/route` priorisieren. Mindestens Kommentar richtigstellen. |

### Mittel

| ID | Bereich | Befund | Stelle |
|---|---|---|---|
| **M1** | Validierung | Fehlende Arrays passieren (`?? []`): `gewichtszuschlaege`, `cello.erlaubteFamilien`, `formate[].papiereInhalt/papiereUmschlag`, `routen[].formate` → Engine TypeError, Rechner für alle Nutzer in der ErrorBoundary, bis jemand im Verlauf wiederherstellt. | `pricingConfig.js:74-79, 88-92, 132-134, 149-151`; Crash `calculateRSTPrice.js:62, 195, 253, 267` |
| **M2** | Validierung | Numerik nur per Koerzion (`'67' > 0` ist true): WV-Preis als String → `gesamt` ist ein String; `zuschlag` als String → NaN bei allen Routen, Empfehlung fällt auf ILDA; `cello.stueckpreis = -5` → negativer Gesamtpreis. Alle mit `error: null`. | `pricingConfig.js:69-71, 76-78, 121-123`; Cello-Stückpreise ungeprüft — Fix: überall `Number.isFinite` |
| **M3** | Validierung | `maxAuflage` nicht gegen WV-Staffeln geprüft → B1 kommt per Config zurück: Kopp `maxAuflage 5000` → 4.000 Ex. mit eingefrorener 1000er-Verarbeitung (7.148,76 €); `maxAuflage 0` wirkt als „unbegrenzt"; `minAuflage > maxAuflage` still tot. | `pricingConfig.js:128-147`, Engine `:139, :303` |
| **M4** | Verwaltung | Edit während des initialen Ladens (loadedRev = 0): Phantom-409 („jemand anderes hat gespeichert", Änderung weg) oder Publish der Cache-Config auf korrekter Rev → fremde Änderungen weg. | `Verwaltung.jsx:264-327, 353-359` — Fix: Inputs bis `state !== 'loading'` sperren; bei gesetztem Pending nicht blind `setConfig` |
| **M5** | Verwaltung | Config-Import ruft `validatePricingConfig` ohne `migratePricingConfig` → jedes Backup von vor 2.6.0 wird abgelehnt („kleinmengenBisAuflage fehlt"). Gleiches bei `getPendingPublish` nach Deploy. | `Verwaltung.jsx:563-570`, `pricingConfig.js:395-404` |
| **M6** | Verwaltung | Erfolgszweig aktualisiert `meta.rev/publishedAt` nicht → Kopf zeigt alten Zeitpunkt, JSON-Export alte Rev, Pending mit alter Rev → falsche Konfliktbox beim nächsten Öffnen („basiert auf Rev 5, inzwischen Rev 6" obwohl Rev 6 die eigene ist). | `Verwaltung.jsx:371-380` — funktionales `setConfig` mit `result.rev/publishedAt` |
| **M7** | App | Deep-Link/Reload auf `/verwaltung` oder `/rechner-rst` landet immer auf `/` (Auth-Init per Effect nach Kind-Navigate). Auch der „Seite neu laden"-Button der ErrorBoundary. | `App.jsx:95-100` — Fix: `useState(() => localStorage.getItem('gc_auth') === 'true')` mit try/catch |
| **M8** | Leadprint | Bindung (Gruppe 5561): alle 6 Listenwerte bekommen 0 € statt nur Drahtheftung 2-fach (16105); 4-fach, Klebebindung, Softcover, Hardcover, Wire-O erscheinen im Shop wählbar zum RST-Preis. Vorlage vom 10.10. hat denselben Zustand (also heute schon im Backend so, unbestätigt ob der Shop sie anders ausblendet). | `leadprintImportBuilder.js:212-214` — Fix: nur `listenwertSchluessel`-Treffer bepreisen, Test auf `5561.16106 === null` |
| **M9** | Leadprint | Weiterleitungs-Ziel ohne `leadprintId` wird still zur Leerzelle, kein Berichtseintrag; `pruefeMappingVollstaendigkeit` prüft IDs nicht. Aktuell alle 16 gesetzt, ein Tippfehler bliebe unbemerkt. | `leadprintImportBuilder.js:188-203`, `leadprintWriter.js:117ff` |

### Niedrig

| ID | Bereich | Befund | Stelle |
|---|---|---|---|
| N1 | Validierung | `wtStandard/wtExpress` ungeprüft → `produktionszeitWT = undefined` bei gültigem Preis. | `pricingConfig.js:128-147` |
| N2 | Validierung | Nicht-monotone WV-Tabelle passiert (Tippfehler 1 statt 75 → Preis fällt mit der Auflage). Default-Tabellen geprüft: alle monoton. | `pricingConfig.js:117-125` |
| N3 | Engine | Unbekannte Farbigkeit (`'2c'`) → NaN statt Fehler; UI/Mapper liefern nur 1c/4c. | `calculateRSTPrice.js:330-336` |
| N4 | Migration | `migratePricingConfig` ergänzt nur Settings, nicht Route-Flags (`dickenAufschlag`, `kleinmengenAnker`), `umschlagAusnahmen`, `cello.erlaubteFamilien`. Wiederhergestellter Stand < 2.4.0 rechnet ohne Dickenaufschlag, Settings sichtbar, kein Hinweis (für Kassen-Anker gibt es einen). | `pricingConfig.js:166-178` |
| N5 | Validierung | `umschlagAusnahmen` auf Papier außerhalb `format.papiereUmschlag` ist wirkungslos, keine Warnung. | `pricingConfig.js:95-106` |
| N6 | Verwaltung | Pending-Konfliktbox publiziert alten Pending-Stand und revertiert spätere Edits; bleibt nach Reset stehen. | `Verwaltung.jsx:582-588` — `setPendingConflict(null)` in `applyChange`/`handleReset` |
| N7 | Verwaltung | Seitenwechsel innerhalb der 900-ms-Debounce: Publish wird bis zum nächsten Verwaltungsbesuch verschoben, Rechner zeigt alten Preis. | `Verwaltung.jsx:321-325` — im Cleanup `runPublish()` statt `clearTimeout` |
| N8 | Verwaltung | `runPublish` ohne try/finally → `inFlightRef` bleibt bei Exception `true`; `validatePricingConfig` wirft bei `wvTabellen.x = null` (`Object.keys(null)`). Nur per direktem POST erreichbar. | `Verwaltung.jsx:361-369`, `pricingConfig.js:111/118` |
| N9 | Rechner | Format-Key, den die Config nicht mehr kennt, bleibt im Formular stehen (leeres Select, „keine Route") — Papiere/Cello werden korrigiert, Format nicht. | `Rechner-RST.jsx:83-105` |
| N10 | Rechner | `handleCalculate` nutzt die Sequenznummer nicht; langsamer Visibility-Refresh kann neuere Button-Antwort überschreiben (unbestätigt). | `Rechner-RST.jsx:117-167` |
| N11 | Leadprint | `pruefeLeadprintExporte.mjs` meldet `article.unsichtbar` als FEHLER (bewusst je Artikel anders); Exit-Code nie ≠ 0; Referenzpfade CWD-relativ. | `scripts/pruefeLeadprintExporte.mjs:20` |
| N12 | Leadprint | `buildLeadprintImport.mjs --config` ohne Pfad → TypeError; `--minimal` loggt „Artikel-Feld unsichtbar" obwohl die Datei nur `article.id` enthält. | `scripts/buildLeadprintImport.mjs:20, 42` |
| N13 | Leadprint | Zeilenmaximum berücksichtigt Veredelungszellen nicht (`produktionszeitWTMax` in `aufschlaegeVeredelung` nicht nachgezogen). Sweep über 7.720 mit-U-Zeilen: 0 Fälle, aktuell folgenlos. | `leadprintMapper.js:103-109` |
| N14 | App | `localStorage` ohne try in `ThemeContext.jsx:21` und `App.jsx:98` → bei gesperrtem Storage Absturz außerhalb der ErrorBoundary (unbestätigt). | |
| N15 | API | Alle Preview-Deployments teilen einen Preview-Store; kaputter Body → 500 statt 400. Kein Fehlverhalten, nur Hinweis. | `api/config.mjs` |

### Unbestätigt / fachlich zu klären

- **U1 Liefertage-Semantik** (`articlePrices.liefertage` als Offset auf „Versandfertig in"): Doku sagt nur „Auswahlliste Liefertermin"; Operator/Bereich stehen nur bei `articleVariety`. Testimport T4 muss das bestätigen, sonst stehen ILDA-Zeilen auf „1 Tag" statt 4. `leadprintImportBuilder.js:37-39`.
- **U2 Alte A5-Artikel** (1112051377/1112051509): Mapping zeigt auf die neuen IDs; ob die alten im Shop noch sichtbar sind, im Backend prüfen. `export_1112051230.xlsx` ist keinem Artikel zugeordnet.
- **U3 Cello-Bogenkosten inkl. Makulaturbogen** (`calculateRSTPrice.js:227`): bei 1 Ex. 2 statt 1 Bogen. Vermutlich gewollt (Laminieren vor dem Schneiden), seit V1 so.
- **U4 Routenlücke 1–9 Ex.**: nur GC rechnet; bei > 48 S. oder > 1,5 mm kein Angebot (bekannt, D1).

## Empfohlene Reihenfolge

1. H1, M4, M6, N6, N7, N8 zusammen (ein Paket „Verwaltung Publish-Pfad", alles in `Verwaltung.jsx`).
2. M1, M2, M3, N1, N2, N3, N5 zusammen (ein Paket „Validierung härten" in `pricingConfig.js` + Tests aus den Scratchpad-Sweeps übernehmen).
3. M5, N4 (Migration beim Import, Route-Flags).
4. M7, N9, N10, N14 (App/Rechner).
5. Leadprint: M8 vor dem nächsten Shop-Import; H2 als Entscheidung; M9, N11–N13 mit dem Commit.

## Prüfskripte (Scratchpad, nicht im Repo)

`/private/tmp/claude-501/-Users-arminrohrmoser-gc-tools/20b15aee-71f0-4459-805b-7522376534ca/scratchpad/`: `monotonie.sweep.test.js`, `consec.sweep.test.js`, `validierung.sweep.test.js`, `validation-gap.test.js`, `celldiff.cjs`, `spotcheck.mjs`, `umschlagwt.mjs`. Die Sweeps lohnen sich als dauerhafte Tests (`vitest.sweep.config.mjs` als Vorlage, Laufzeit einige Sekunden).
