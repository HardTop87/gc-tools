# RST-Rechner — Update-Spezifikation (Stand 2026-07-06, Rev. 2)

> **Zweck:** Vollständige Anweisung für Claude Code zum Update des gc-tools-Projekts
> (`src/utils/calculateRSTPrice.js`, `src/data/pricingData.js`, `src/data/paperPrices.js`).
> Basis: E-Mail Guido Coenen vom 29.03.2026, Excel `RST GC-AR-V2_gc.xlsx` (Blatt Data_GC,
> rot markierte Änderungen) und die aktualisierten Übersichts-Dateien inkl. DIN A6 und
> „Produktion GC". Referenz für den Ist-Zustand: `RST-Rechner-Export.md` (2026-07-05).
>
> Alle Preise EUR netto. Abschnitte mit **[ANNAHME]** sind mit Guido zu verifizieren,
> aber so umzusetzen wie beschrieben. Abschnitte mit **[PLATZHALTER]** enthalten
> vorläufige Werte, die im UI/Code als solche gekennzeichnet werden müssen.

---

## 0. Zusammenfassung der Änderungen

1. GC-intern-Route wird zu **„GC (Horizon)"**: neue Verarbeitungspreistabelle (1–500 Ex.,
   8–48 Seiten), Auflagenlimit 100 → **500**, neuer Umschlag-Zuschlag (ab 11 Stück:
   5 € + 0,05 €/Stück), Nutzen jetzt formatabhängig (A4=1, A5=2, A6=4).
   Der SRA4-Sonderfall (A5 Hoch intern: Klickfaktor 0,7, halber Bogenpreis) **entfällt**.
2. **Neues Format DIN A6 Hochformat** (4 Nutzen, Papiere wie A4 Hoch, Routen: GC + Kopp,
   ILDA nicht).
3. **Seitenlimits werden berechnet statt tabelliert**: aus Blattdicken (µm) und
   maximaler Broschürendicke pro Route (GC: 1,5 mm; Partner: 2,5 mm). Die bisherigen
   Limit-Tabellen (Kap. 8 des Exports) werden vollständig ersetzt.
   Limits gelten künftig für **alle Routen** (bisher nur Intern + Banner).
4. **Papierdatenbank**: `N_160` als Inhaltspapier entfernen (bleibt Umschlag);
   Blattdicken ergänzen; zwei Platzhalterpreise kennzeichnen.
5. **Cello bei Banner-Formaten**: Bogen-Stückpreis × 1,5 (Grundkosten 20 € unverändert).
6. **Neues Wartungs-Backend** (Abschnitt 8): alle Preise/Parameter in einer
   zentralen, versionierten Konfiguration; Papierpreise werden **pro 1000 Bogen**
   gepflegt; JSON-Export/-Import der Gesamt-Config, CSV/XLSX-Export/-Import der
   Papierpreisliste.
7. Kopp/ILDA-Tabellen, Interpolation, Express (+10 %), Empfehlungslogik,
   Makulatur- und DB-Formeln, Gewichtsberechnung: **unverändert**.

**Bestätigt durch Armin/Guido (06.07.2026):** GC-Lookup mit Umschlag weiterhin
mit +1 Bogenteil (3.2); Familienregel bei Papierkombinationen gilt strikt —
verifiziert gegen die Farbmarkierungen in allen 10 Übersichts-Dateien (5.1);
BD-170-Inhalt darf mit allen BD-Umschlägen kombiniert werden; BD-170-Formelfehler
(N4 statt N3) wird durch die berechneten Limits korrigiert.

---

## 1. Routen (neu)

| Route | Typ | Std. | Express | Formate | Auflage |
|---|---|---|---|---|---|
| GC (Horizon) | Eigenproduktion | 3 WT | 2 WT | A6_Hoch, A5_Hoch, A5_Quer, A4_Hoch | 1–500 |
| Partner Kopp | Fremdvergabe | 3 WT | 2 WT | A6_Hoch, A5_Hoch, A5_Quer, A4_Hoch | ab 10 |
| Partner ILDA | Fremdvergabe | 4 WT | 3 WT | A5_Hoch, A5_Quer, A4_Hoch, A4_Quer, 30x30 | ab 10 (Banner) / ab 100 (Standard, Interpolation ab 100er-Staffel wie bisher — Achtung: laut Guido gilt „100er-Preis bis runter zu 10 Stück" nur für Banner; Standardformate bei ILDA bleiben wie im Ist-Stand) |

**[ANNAHME]** Es gibt nur noch **eine** GC-Route (Horizon). Die alte „Intern (Inline auf
KM)"-Route entfällt, weil ihre Preistabelle durch die neue Data_GC-Tabelle ersetzt wurde
und keine separate Inline-Tabelle existiert. Die Routen-Definition bleibt datengetrieben
(Array/Config), sodass eine Route „GC KM-Inline" später mit eigener Tabelle und
Nutzen=1 ergänzt werden kann, ohne die Engine anzufassen.

Umbenennung im UI: „Intern (Inline auf KM)" → „GC (Horizon)".

## 2. Formate (neu: A6_Hoch; Nutzen jetzt auch für GC formatabhängig)

| Format | Nutzen GC | Nutzen Partner | Banner | Offenes Format (B × H mm) |
|---|---|---|---|---|
| A6_Hoch | 4 | 4 | nein | 210 × 148 |
| A5_Hoch | 2 | 2 | nein | 296 × 210 |
| A5_Quer | 2 | 2 | nein | 420 × 148 |
| A4_Hoch | 1 | 1 | nein | 420 × 297 |
| A4_Quer | 1 (nur ILDA) | 1 | ja | 594 × 210 |
| 30x30 | 1 (nur ILDA) | 1 | ja | 600 × 300 |

- A6_Hoch: Produktion mit 4 Nutzen auf SRA3/SRA3++ (Guido, Mail 29.03., Punkt 2a).
  Papier-, Klick- und Limit-Daten **identisch zu A4_Hoch**.
- **Gestrichen:** Sonderfall „GC + A5_Hoch auf SRA4" (`dynFaktorKlickSRA4` = 0,7 und
  halber Bogenpreis). A5 läuft bei GC jetzt mit 2 Nutzen auf SRA3 — Papier- und
  Klickkosten pro Exemplar ergeben sich regulär über den Nutzen
  (`nettoBogen = ceil(auflage × bogenteile / nutzen)`), keine Sonderformel mehr.
  Die Einstellung `dynFaktorKlickSRA4` aus den globalen Settings entfernen
  (oder deaktiviert lassen und im UI ausblenden). **[ANNAHME]**
- `dynFaktorBanner` = 1,5 auf den Klickpreis bleibt unverändert.

## 3. GC (Horizon): neue Verarbeitungspreistabelle

Ersetzt Tabelle 7.1 des Exports vollständig. Quelle: `RST GC-AR-V2_gc.xlsx`,
Blatt `Data_GC` (rot markiert), Stand 29.03.2026.
Zeile = Bogenteile (Lookup wie bisher über `bogenteileGesamt`, siehe 3.2),
Spalte = Auflagenstaffel, dazwischen lineare Interpolation (Regeln aus Export Kap. 6.9
unverändert). Preise in € pro Auftrag.

| Bogenteile | Umfang | 1 | 2 | 3 | 4 | 5 | 10 | 20 | 50 | 100 | 200 | 300 | 400 | 500 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 8 | 5 | 7 | 9 | 11 | 13 | 15 | 20 | 25 | 30 | 31,8 | 33,6 | 35,4 | 37,2 |
| 3 | 12 | 5 | 7,5 | 10 | 12,5 | 15 | 17,5 | 23 | 29 | 35 | 37,7 | 40,4 | 43,1 | 45,8 |
| 4 | 16 | 5 | 8 | 11 | 14 | 17 | 20 | 26 | 33 | 40 | 43,6 | 47,2 | 50,8 | 54,4 |
| 5 | 20 | 5 | 8,4 | 11,8 | 15,2 | 18,6 | 22 | 27,5 | 37 | 45 | 49,5 | 54 | 58,5 | 63 |
| 6 | 24 | 10 | 13,2 | 16,4 | 19,6 | 22,8 | 26 | 35 | 41,5 | 50 | 55,4 | 60,8 | 66,2 | 71,6 |
| 7 | 28 | 10 | 14 | 18 | 22 | 26 | 30 | 40 | 50 | 60 | 66,3 | 72,6 | 78,9 | 85,2 |
| 8 | 32 | 10 | 14,6 | 19,2 | 23,8 | 28,4 | 33 | 43,5 | 54 | 65 | 72,2 | 79,4 | 86,6 | 93,8 |
| 9 | 36 | 15 | 18,9 | 22,8 | 26,7 | 30,6 | 34,5 | 46 | 58 | 70 | 78,1 | 86,2 | 94,3 | 102,4 |
| 10 | 40 | 15 | 19,5 | 24 | 28,5 | 33 | 37,5 | 50 | 62 | 75 | 84 | 93 | 102 | 111 |
| 11 | 44 | 20 | 24 | 28 | 32 | 36 | 40 | 53 | 66 | 80 | 89,9 | 99,8 | 109,7 | 119,6 |
| 12 | 48 | 20 | 24,4 | 28,8 | 33,2 | 37,6 | 42 | 56 | 70 | 85 | 95,8 | 106,6 | 117,4 | 128,2 |

Keine Zeilen > 12 Bogenteile → GC-Route liefert dann wie bisher den Fehler
„nicht in Tabelle hinterlegt".

### 3.1 Umschlag-Zuschlag GC (neu)

Für Broschüren **mit Umschlag** bei der GC-Route:

```
auflage ≤ 10:  umschlagZuschlagGC = 0
auflage ≥ 11:  umschlagZuschlagGC = 5,00 € + 0,05 € × auflage
```

Der Zuschlag deckt Rillung/Umschlagverarbeitung auf der Horizon ab (Titel der
Preisliste: „ohne Rillung des Umschlags"; Kopp/ILDA sind „inkl. Rillung" — dort
kein Zuschlag). Der Zuschlag geht in die Gesamtsumme ein (vor Express-Aufschlag)
und wird in der Preiskarte als eigene Position ausgewiesen
(z. B. `umschlagZuschlag` im Ergebnisobjekt, bei Kopp/ILDA = 0).

Als justierbare Settings anlegen: `gcUmschlagGrundkosten` (5 €),
`gcUmschlagStueckpreis` (0,05 €), `gcUmschlagAbAuflage` (11).

### 3.2 Lookup mit Umschlag **[BESTÄTIGT]**

Der Tabellen-Lookup nutzt weiterhin `bogenteileGesamt = seiten/4 (+1 bei Umschlag)` —
konsistent zu Kopp/ILDA (von Armin bestätigt, 06.07.2026). Der Umschlag-Zuschlag
aus 3.1 kommt **zusätzlich** dazu.
Plausibilisierung gegen Guidos Zielpreise (netto, Auflage 1, Setup 15 € inkl.):

| Fall | Ziel | Rechnung (WV + Setup, ohne Material) |
|---|---|---|
| bis 20 S. ohne Umschlag | 25 € | BT5 → 5 + 15 = 20 € + Material ≈ 22–25 € ✓ |
| bis 20 S. mit Umschlag | 30 € | BT6 → 10 + 15 = 25 € + Material ≈ 28–31 € ✓ |
| 24–48 S. ohne Umschlag | 30 € | BT6–12 → 10–20 + 15 + Material ✓ |
| 24–48 S. mit Umschlag | 35 € | BT7–13(!) → ab 24 S. + U passt bis 44 S. Inhalt ✓ |

Konsequenz: mit Umschlag sind bei GC max. **44 Inhaltsseiten** möglich
(44/4 + 1 = 12).

## 4. Seitenlimits: berechnen statt tabellieren

Die statischen Limit-Tabellen (Export Kap. 8, inkl. des dort dokumentierten
N_120/N_160-Tippfehlers) **komplett entfernen** und durch eine Berechnung ersetzen.
Das entspricht exakt den Formeln der Übersichts-Excel-Dateien und behebt nebenbei
deren BD-170-Formelfehler (dort wurde fälschlich Zelle N4 statt N3 referenziert).

### 4.1 Formel

```
maxDicke(Route):  GC (Horizon) = 1500 µm   |   Kopp, ILDA = 2500 µm

ohne Umschlag: maxSeiten = floor( maxDicke / dickeInhalt ) × 4
mit Umschlag:  maxSeiten = floor( (maxDicke − dickeUmschlag) / dickeInhalt ) × 4
```

`dickeInhalt` / `dickeUmschlag` = Blattdicke in µm (siehe 5.2). Gültigkeit einer
Eingabe: `seiten ≤ maxSeiten`, **zusätzlich** muss die Bogenteile-Zeile in der
WV-Tabelle der Route existieren (bei GC also max. 48 bzw. 44 Seiten, siehe 3.2).

Validierungsbeispiele (müssen exakt die Werte der Übersichts-Dateien reproduzieren):

- CC 100 ohne Umschlag, Partner: floor(2500/106)×4 = 92 ✓
- CC 100 ohne Umschlag, GC: floor(1500/106)×4 = 56 ✓
- CC 100 + Umschlag CC 160, Partner: floor((2500−166)/106)×4 = 88 ✓
- BD 170 + Umschlag BD 170, Partner: floor((2500−159)/159)×4 = **56**
  (Excel zeigt wegen Formelfehler 60 — 56 ist korrekt, mit Guido abgestimmt)
- BD 170 + Umschlag BD 170, GC: floor((1500−159)/159)×4 = **32** (Excel: 36, s. o.)
- BD 170 Inhalt mit höheren Umschlaggrammaturen ist ausdrücklich erlaubt
  (Guido-Freigabe); die Formel liefert die Limits automatisch,
  z. B. BD 170 + BD 350, Partner: floor((2500−350)/159)×4 = 52.

### 4.2 Geltungsbereich (Änderung!)

Limits gelten ab jetzt für **alle Routen** (GC mit 1500 µm, Kopp/ILDA mit 2500 µm) —
bisher wurden sie bei Partnern in Standardformaten nicht geprüft.
Banner-Formate (nur ILDA): 2500 µm.

`maxDickeGC` (1500) und `maxDickePartner` (2500) als justierbare Settings anlegen.

## 5. Papierdatenbank

### 5.1 Änderungen an den Zulässigkeitslisten

Maßgeblich sind ausschließlich die Übersichts-Dateien (Guido-Freigabe).

**Inhalt — A4_Hoch, A5_Quer, A6_Hoch:**
`CC_100, CC_120, CC_160, N_80, N_90, N_100, N_120, BD_115, BD_135, BD_150, BD_170, R_80, R_100`
(→ `N_160` als Inhalt **entfernen**; kein `R_90` hier)

**Inhalt — A5_Hoch:**
`CC_100, CC_120, CC_160, N_80, N_90, N_120, BD_115, BD_135, BD_150, BD_170, R_90`
(kein N_100, kein R_80/R_100)

**Umschlag — A4_Hoch, A5_Quer, A6_Hoch:**
`CC_160, CC_200, CC_250, CC_300, CC_350, N_160, N_200, N_250, N_300, BD_170, BD_200, BD_250, BD_300, BD_350, R_300`

**Umschlag — A5_Hoch:**
`CC_160, CC_250, N_160, N_250, BD_170, BD_200, BD_250, BD_300, BD_350, R_300`

**Banner (A4_Quer, 30x30) — Inhalt:** `CC_120_BAN, CC_160_BAN, N_100_BAN, BD_135_BAN`
**Banner — Umschlag:** `CC_160_BAN, CC_250_BAN, CC_300_BAN, N_250_BAN, N_300_BAN, BD_170_BAN, BD_200_BAN, BD_250_BAN, BD_300_BAN`

Die Zulässigkeit ist damit **formatabhängig** — falls die Listen bisher global waren,
pro Format (bzw. Formatgruppe A4H/A5Q/A6H, A5H, Banner) hinterlegen.

**[BESTÄTIGT] Familienregel:** Die zulässigen Kombinationen sind in den
Übersichts-Dateien durch **Zellfarben** markiert. Die Farbmarkierungen wurden
programmatisch ausgelesen und entsprechen in allen 10 Dateien ausnahmslos der
Regel „Umschlag hat dieselbe Papierfamilie wie der Inhalt", mit **vier Familien**:
CC↔CC, Natur↔Natur, BD↔BD, **Recycling↔Recycling** (R-Inhalte ausschließlich mit
R_300-Umschlag; R_300 ist umgekehrt nicht für Natur-Inhalte zulässig).
Unmarkierte Zellen mit Zahlenwerten sind nur mitgezogene Formeln, keine Freigaben.
Implementierung: keine Kombinationsmatrix nötig — Prüfung
`familie(Inhalt) === familie(Umschlag)` mit `familie ∈ {CC, N, BD, R}`,
plus Dickenformel aus 4.1. Einzige gewollte Erweiterung gegenüber den Farben:
BD-170-Inhalt ist mit **allen** BD-Umschlägen (BD_170–BD_350) kombinierbar
(Freigabe Armin/Guido; in den Dateien ist die Zeile nur unvollständig gefüllt).

### 5.2 Blattdicken (neu, µm — Quelle: Übersichts-Dateien)

| Papier | Dicke | Papier | Dicke |
|---|---|---|---|
| CC_100 | 106 | N_160 | 202 |
| CC_120 | 126 | N_200 | 252 |
| CC_160 | 166 | N_250 | 315 |
| CC_200 | 200 | N_300 | 378 |
| CC_250 | 245 | BD_115 | 96 |
| CC_300 | 305 | BD_135 | 117 |
| CC_350 | 350 | BD_150 | 132 |
| N_80 | 107 | BD_170 | 159 |
| N_90 | 119 | BD_200 | 182 |
| N_100 | 131 | BD_250 | 231 |
| N_120 | 173 | BD_300 | 290 |
| R_80 | 104 | BD_350 | 350 |
| R_90 | 116 | R_300 | 380 |
| R_100 | 127 | | |

Banner-Papiere (`*_BAN`): identische Dicke wie das gleichnamige Standardpapier.

### 5.3 Preise

Bogenpreise unverändert (Export Kap. 5), mit zwei Kennzeichnungen:

- `R_90` (0,04 €): **[PLATZHALTER]** — fehlt im PAPIER-Blatt, Preis von Guido nachliefern lassen.
- `N_100_BAN` (0,09 €): **[PLATZHALTER/NAMENSKLÄRUNG]** — PAPIER-Blatt führt
  „80g Natur BANNER" (90 €/1000), die Übersichten „N 100" als Banner-Inhalt.
  Vorerst als 100g mit 0,09 € weiterführen, Dicke 131 µm; Name/Preis mit Guido klären.

Platzhalter im Code mit `isPlaceholder: true` markieren und im UI dezent kennzeichnen.

## 6. Cellophanierung

Unverändert: nur mit Umschlag, nur Kategorien CC/BD, Grundkosten 20 €,
Stückpreise glänzend 0,10 / matt 0,20 / softtouch 0,30 € pro Umschlagbogen.

**Neu — Banner-Formate (A4_Quer, 30x30):** Stückpreis × 1,5
(glänzend 0,15 / matt 0,30 / softtouch 0,45 €). Grundkosten bleiben 20 €.

```
celloKosten = celloGrundkosten + bogenUmschlag × stueckpreis(art) × (isBanner ? 1,5 : 1)
```

Faktor als Setting `celloFaktorBanner` (1,5) anlegen.

## 7. Unverändert (nicht anfassen)

- Makulaturformel, DB-Formeln (dbDruck/dbPapier), Gewichtszuschlag-Stufen,
  Klick-Grundpreise (0,015/0,04), `dynFaktorBanner` 1,5, Setup 15 €,
  Express +10 %, Gewichtsberechnung.
- Kopp-Tabelle (Staffeln 10–1000; 10/20/50 = 100er-Preis) und alle vier ILDA-Tabellen
  inkl. Banner-Staffeln ab 10 Stück.
- Interpolationsregeln (Export Kap. 6.9).
- Empfehlungslogik inkl. `preferInternDelta` 20 € / `preferKoppDelta` 30 €
  (gilt jetzt für „GC (Horizon)" statt „Intern").

## 8. Wartungs-Backend (Konfigurations-Verwaltung)

Ziel: Guido/Armin können alle Preise und Parameter pflegen, ohne Code oder
Formeln anzufassen. Dazu wird die gesamte Kalkulationsbasis in **eine zentrale
Konfiguration** überführt; die Engine erhält die Config als Parameter und
enthält selbst keine Zahlenliterale mehr.

### 8.1 Datenmodell (`pricingConfig`)

Ein einziges JSON-Objekt als Single Source of Truth, mit `version` (semver oder
Datum) und `stand` (Datum der letzten Preispflege). Inhalt:

```
pricingConfig
├── meta            { version, stand, kommentar }
├── settings        { baseGrundpreis1c, baseGrundpreis4c, dynFaktorBanner,
│                     celloGrundkosten, celloFaktorBanner, setupKosten,
│                     preferInternDelta, preferKoppDelta, expressFaktor,
│                     gcUmschlagGrundkosten, gcUmschlagStueckpreis,
│                     gcUmschlagAbAuflage, maxDickeGC, maxDickePartner }
├── gewichtszuschlaege   [ {abGsm, zuschlag}, … ]
├── papiere         [ { id, name, familie, gsm, dickeUm,
│                       preisPro1000,            ← gepflegter Wert
│                       isBanner, isPlaceholder } ]
│                   (Bogenpreis = preisPro1000 / 1000 → wird berechnet,
│                    NIE gespeichert)
├── formate         [ { key, name, offenB, offenH, isBanner,
│                       nutzenGC, nutzenPartner, papiereInhalt[], papiereUmschlag[] } ]
├── routen          [ { key, name, typ, wtStandard, wtExpress,
│                       formate[], maxAuflage, minAuflage, wvTabelleRef,
│                       umschlagZuschlag: bool, maxDickeRef } ]
├── wvTabellen      { gc_horizon: {…}, kopp: {…}, ilda_mitUmschlag: {…},
│                     ilda_ohneUmschlag: {…}, ilda_banner_mit: {…},
│                     ilda_banner_ohne: {…} }
└── cello           { grundkosten (ref settings), arten: [ {key, name, stueckpreis} ] }
```

### 8.2 Backend-UI (neuer Bereich in der App, z. B. „Verwaltung")

- **Papierpreise** (wichtigster Teil): Tabelle mit Spalten
  *Name | Familie | g/m² | Dicke (µm) | Preis / 1000 Bogen (editierbar) |
  Preis / Bogen (berechnet, read-only)*. Eingabe ausschließlich pro 1000 Bogen.
  Platzhalter-Papiere (isPlaceholder) sichtbar markiert.
- **Grundpreise & Faktoren**: alle `settings`-Werte als Formularfelder mit
  Beschreibung und Standardwert-Anzeige.
- **WV-Tabellen**: editierbares Grid pro Tabelle (Bogenteile × Staffeln);
  mindestens aber JSON-sichtbar und über Import austauschbar.
- Änderungen wirken sofort auf die Kalkulation (Config im State),
  Persistenz in `localStorage`, Button „Auf Standard zurücksetzen"
  (Standard = im Repo eingecheckte Default-Config).

### 8.3 Export / Import

- **Gesamt-Config als JSON**: Export-Button lädt `pricingConfig-<datum>.json`
  herunter; Import validiert Schema + Version und übernimmt.
  Die exportierte JSON kann als neue Default-Config ins Repo committet werden
  (Datei z. B. `src/data/pricingConfig.default.json`).
  Diese JSON ist später auch die Eingangsgröße für den Leadprint-Mapper.
- **Papierpreise als CSV und XLSX**: Export mit Spalten
  `id;name;familie;gsm;dicke_um;preis_pro_1000`. Import: Matching über `id`,
  aktualisiert nur `preisPro1000` (und optional `dickeUm`); unbekannte IDs
  werden mit Warnung gelistet, nicht stillschweigend angelegt.
  So kann Guido die Preisliste in Excel pflegen und zurückspielen.
- Bei jedem Import: Zusammenfassung anzeigen („12 Preise geändert, 2 unverändert,
  1 unbekannte ID übersprungen") vor dem Übernehmen.

### 8.4 Validierung beim Import

- Pflichtfelder vorhanden, Preise > 0, Dicken > 0, Staffeln aufsteigend,
  WV-Zeilen lückenlos in 1er-Schritten der Bogenteile.
- Referenz-Integrität: jede `papiereInhalt`/`papiereUmschlag`-ID existiert
  in `papiere`; jede Route referenziert existierende WV-Tabellen.
- Bei Fehlern: Import ablehnen mit konkreter Fehlermeldung (Zeile/Feld).

## 9. Umsetzungsreihenfolge & Tests

1. **Refactoring auf `pricingConfig` (Abschnitt 8.1):** zuerst den Ist-Stand
   1:1 in die zentrale Config überführen (Engine nimmt Config als Parameter,
   keine Zahlenliterale mehr im Berechnungscode). Bestehende Referenzrechnungen
   müssen danach unverändert grün sein — das sichert das Refactoring ab.
2. **Datenschicht (in der Config):** Blattdicken + maxDicke-Settings, neue
   Data_GC-Tabelle, Zulässigkeitslisten pro Format, A6_Hoch, N_160-Inhalt raus,
   Platzhalter-Flags.
3. **Engine:** Nutzen pro Route×Format, SRA4-Sonderfall entfernen,
   Limit-Berechnung (4.1) für alle Routen, GC-Umschlag-Zuschlag (3.1),
   Cello-Banner-Faktor, Familienprüfung über `familie`-Feld, Intern-Limit 500.
4. **Backend-UI (Abschnitt 8.2–8.4):** Verwaltungsbereich, Papierpreise
   pro 1000 Bogen, JSON-Export/-Import, CSV/XLSX für Papierpreise.
5. **UI Rechner:** Routen-Umbenennung, A6 im Format-Dropdown, neue Settings
   (gcUmschlag*, maxDicke*, celloFaktorBanner), Ausweis `umschlagZuschlag`
   in den Preiskarten, Platzhalter-Hinweis bei R_90 / N_100_BAN.
6. **Tests (neu schreiben, alte Referenzen aus dem Export sind durch die neuen
   GC-Preise bewusst obsolet):**
   - Limit-Berechnung reproduziert stichprobenartig die Übersichts-Dateien
     (Beispiele aus 4.1, inkl. der beiden korrigierten BD-170-Werte).
   - Interpolation GC: 24 Seiten (BT6), 150 Ex. → WV = (55,4−50)/100×50+50 = 52,70 €.
   - Kleinmengen-Zielpreise (Auflage 1, Standard, günstiges Papier):
     ≤20 S. ohne U. ≈ 25 €, mit U. ≈ 30 €, 24–48 S. ohne U. ≈ 30 €, mit U. ≈ 35 €
     (Toleranz ±3 €, dient als Plausibilitätscheck, nicht als harte Assertion).
   - GC-Umschlag-Zuschlag: Auflage 10 → 0 €; Auflage 11 → 5,55 €; Auflage 100 → 10 €.
   - A6_Hoch, 100 Ex., 24 S.: GC rechnet mit Nutzen 4
     (nettoBogenInhalt = ceil(100×6/4) = 150), ILDA liefert „Format nicht unterstützt".
   - A5_Hoch bei GC: Nutzen 2, kein SRA4-Faktor mehr im Klickpreis.
   - Cello Banner: 30x30, mit Umschlag, matt → Stückpreis 0,30 €/Bogen.
   - Partner-Limitprüfung greift jetzt auch in Standardformaten
     (z. B. CC_120 + CC_300, 72 Seiten: Partner ok (68? → 68 < 72 → Fehler),
     genaue Werte aus 4.1 ableiten).
7. Nach Grün: neuen Referenz-Export (analog `RST-Rechner-Export.md`) generieren
   und 4–6 Beispielrechnungen für Guidos Kontrolle ausgeben; außerdem
   `pricingConfig.default.json` exportieren und ins Repo committen.

## 10. Offene Punkte (blockieren die Umsetzung nicht, an Guido)

1. Preis + Name: 90g Recycling; „80g" vs. „100g Natur BANNER" (siehe 5.3) —
   bis dahin Platzhalter, im Backend als solche markiert.
2. Perspektivisch: eigene WV-Tabelle für „GC KM-Inline" als separate Route,
   falls gewünscht (Architektur über `routen`-Config vorbereitet).
3. Leadprint-Mapper: separater Schritt, benötigt Beispiel-xlsx-Export aus dem
   Leadprint-Backend; Eingangsgröße ist die `pricingConfig`-JSON aus 8.3
   (nicht Teil dieser Spec).
