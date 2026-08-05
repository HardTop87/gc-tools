# RST-Rechner — Kompletter Export der Berechnungslogik (Rückstichheftung)

> **Version 2.3.0 · Stand 2026-08-06.** Ersetzt den Export vom 2026-07-30.
> **Neu in 2.3.0** (Mail Guido vom 05.08.2026, `Makulatur.xlsx`): Die Makulatur ist ein
> **Prozentsatz auf die gedruckten Bogen des Gesamtauftrags** — bisher wurde dieselbe
> Formel als absolute Bogenzahl je Komponente gerechnet (Kap. 5.2). Wirkung: Auflagen
> unter 10 Ex. werden minimal günstiger, ab ca. 50 Ex. 3–4 % teurer. Außerdem ist
> **Partner Kopp auf 1.000 Exemplare begrenzt** (Guidos Produktionsmatrix); darüber
> liefert der Rechner kein Angebot mehr, statt den Verarbeitungspreis der 1.000er-Staffel
> flach fortzuschreiben.
>
> Aus 2.2.0 unverändert: V3-Preisupdate lt. Mail Guido vom 30.07.2026 (`RST GC-AR-V3.xlsx`,
> `Preise gc.xlsx`): neue Papierpreise 07/2026, neue GC-Verarbeitungstabelle,
> Banner-Natur jetzt N_80_BAN/N_120_BAN (N_100_BAN nicht lieferbar), R_300 nicht mehr
> als A5-Hoch-Umschlag (Breitbahn). Seit 2.1.1: ILDA maximal 500 Exemplare.
> Seitenlimits weiterhin per Dickenformel, Familienregel unverändert (Entscheidung
> Armin 30.07. — die Matrizen der V3-Datei werden nicht übernommen).
>
> **Single Source of Truth:** `src/data/pricingConfig.default.json` — alle Zahlen dieses Dokuments
> stammen maschinell aus dieser Datei. Engine: `src/utils/calculateRSTPrice.js` (enthält keine Preisliterale mehr).
> Anpassungen zur Laufzeit über den neuen Bereich **Verwaltung** in der App (localStorage; JSON/CSV/XLSX-Import/-Export).
>
> Alle Preise EUR netto.

## 1. Produkt & Produktionswege

| Route | Typ | Std. | Express | Formate | Auflage |
|---|---|---|---|---|---|
| GC (Horizon) | Eigenproduktion | 3 WT | 2 WT | A6_Hoch, A5_Hoch, A5_Quer, A4_Hoch | 1–500 |
| Partner Kopp | Fremdvergabe | 3 WT | 2 WT | A6_Hoch, A5_Hoch, A5_Quer, A4_Hoch | 10–1.000 |
| Partner ILDA | Fremdvergabe | 4 WT | 3 WT | A5_Hoch, A5_Quer, A4_Hoch, A4_Quer, 30x30 | ab 100 (Standard) / ab 10 (Banner), **max. 500** |

**Express-Zuschlag:** +10 % auf die Gesamtsumme (alle Routen).
Die frühere Route „Intern (Inline auf KM)" heißt jetzt **GC (Horizon)** mit neuer Preistabelle und Auflagen bis 500.

## 2. Formate

| Format | Nutzen GC | Nutzen Partner | Banner | Offenes Format (B × H mm) |
|---|---|---|---|---|
| A4_Hoch (A4 Hochformat) | 1 | 1 | nein | 420 × 297 |
| A5_Hoch (A5 Hochformat) | 2 | 2 | nein | 296 × 210 |
| A5_Quer (A5 Querformat) | 2 | 2 | nein | 420 × 148 |
| A6_Hoch (A6 Hochformat) | 4 | 4 | nein | 210 × 148 |
| A4_Quer (A4 Querformat (Banner)) | 1 | 1 | ja | 594 × 210 |
| 30x30 (30 × 30 cm quadratisch (Banner)) | 1 | 1 | ja | 600 × 300 |

- **Neu: A6_Hoch** — 4 Nutzen auf SRA3, Papiere/Klicks wie A4 Hoch; Routen: GC + Kopp (ILDA nicht).
- **Entfallen:** SRA4-Sonderfall für GC + A5_Hoch (Klickfaktor 0,7, halber Bogenpreis). A5 läuft bei GC regulär mit 2 Nutzen auf SRA3.
- Banner-Formate: Klickpreis × dynFaktorBanner (1,5); nur ILDA.

## 3. Globale Einstellungen (Standardwerte)

| Einstellung | Wert | Bedeutung |
|---|---|---|
| `baseGrundpreis1c` | 0,015 | Klick-Grundpreis pro Seite SRA3, 1-farbig |
| `baseGrundpreis4c` | 0,04 | Klick-Grundpreis pro Seite SRA3, 4-farbig |
| `dynFaktorBanner` | 1,5 | Multiplikator Klickpreis bei Banner-Formaten |
| `celloGrundkosten` | 20 | Fixkosten Cellophanierung pro Auftrag (€) |
| `celloFaktorBanner` | 1,5 | Multiplikator Cello-Bogen-Stückpreis bei Banner-Formaten (NEU) |
| `setupKosten` | 15 | Einrichtekosten pro Auftrag, jede Route (€) |
| `preferInternDelta` | 20 | Empfehlung: GC bis zu diesem Mehrpreis bevorzugen (€) |
| `preferKoppDelta` | 30 | Empfehlung: Kopp bis zu diesem Mehrpreis ggü. ILDA bevorzugen (€) |
| `expressFaktor` | 0,1 | Express-Aufschlag als Faktor (0,1 = +10 %) |
| `gcUmschlagGrundkosten` | 5 | GC-Umschlag-Zuschlag: Grundkosten (€) (NEU) |
| `gcUmschlagStueckpreis` | 0,05 | GC-Umschlag-Zuschlag: pro Stück (€) (NEU) |
| `gcUmschlagAbAuflage` | 11 | GC-Umschlag-Zuschlag greift ab dieser Auflage (NEU) |
| `maxDickeGC` | 1500 | Max. Broschürendicke GC/Horizon in µm — Basis der Seitenlimits (NEU) |
| `maxDickePartner` | 2500 | Max. Broschürendicke Kopp/ILDA in µm (NEU) |

*Entfernt: `dynFaktorKlickSRA4` (SRA4-Sonderfall existiert nicht mehr).*

## 4. Papierdatenbank

Familien: `CC` = ColorCopy, `N` = Natur/Offset, `BD` = Bilderdruck, `R` = Recycling (jetzt eigene Familie!).
Gepflegt wird der **Preis pro 1000 Bogen**; der Bogenpreis wird daraus berechnet (÷ 1000) und nie gespeichert.

| ID | Name | Familie | g/m² | Dicke (µm) | Preis/1000 Bogen € | Hinweis |
|---|---|---|---|---|---|---|
| N_80 | 80g Natur | N | 80 | 107 | 30 |  |
| N_90 | 90g Natur | N | 90 | 119 | 33,7 |  |
| N_100 | 100g Natur | N | 100 | 131 | 37,8 |  |
| N_120 | 120g Natur | N | 120 | 173 | 45,4 |  |
| N_160 | 160g Natur | N | 160 | 202 | 65,1 |  |
| N_200 | 200g Natur | N | 200 | 252 | 81,4 |  |
| N_250 | 250g Natur | N | 250 | 315 | 102 |  |
| N_300 | 300g Natur | N | 300 | 378 | 122 |  |
| BD_115 | 115g Bilderdruck | BD | 115 | 96 | 37,7 |  |
| BD_135 | 135g Bilderdruck | BD | 135 | 117 | 44,3 |  |
| BD_150 | 150g Bilderdruck | BD | 150 | 132 | 49,2 |  |
| BD_170 | 170g Bilderdruck | BD | 170 | 159 | 55,8 |  |
| BD_200 | 200g Bilderdruck | BD | 200 | 182 | 65,6 |  |
| BD_250 | 250g Bilderdruck | BD | 250 | 231 | 83 |  |
| BD_300 | 300g Bilderdruck | BD | 300 | 290 | 99,6 |  |
| BD_350 | 350g Bilderdruck | BD | 350 | 350 | 118 |  |
| CC_100 | 100g ColorCopy | CC | 100 | 106 | 43 |  |
| CC_120 | 120g ColorCopy | CC | 120 | 126 | 53,1 |  |
| CC_160 | 160g ColorCopy | CC | 160 | 166 | 70,8 |  |
| CC_200 | 200g ColorCopy | CC | 200 | 200 | 89,3 |  |
| CC_250 | 250g ColorCopy | CC | 250 | 245 | 111,6 |  |
| CC_300 | 300g ColorCopy | CC | 300 | 305 | 138,7 |  |
| CC_350 | 350g ColorCopy | CC | 350 | 350 | 161,8 |  |
| R_80 | 80g Recycling | R | 80 | 104 | 35 |  |
| R_90 | 90g Recycling | R | 90 | 116 | 41,2 |  |
| R_100 | 100g Recycling | R | 100 | 127 | 45,8 |  |
| R_300 | 300g Recycling | R | 300 | 380 | 145,4 |  |
| CC_120_BAN | 120g ColorCopy BANNER | CC | 120 | 126 | 81 |  |
| CC_160_BAN | 160g ColorCopy BANNER | CC | 160 | 166 | 107 |  |
| CC_250_BAN | 250g ColorCopy BANNER | CC | 250 | 245 | 169 |  |
| CC_300_BAN | 300g ColorCopy BANNER | CC | 300 | 305 | 210 |  |
| BD_135_BAN | 135g Bilderdruck BANNER | BD | 135 | 117 | 70 |  |
| BD_170_BAN | 170g Bilderdruck BANNER | BD | 170 | 159 | 85 |  |
| BD_200_BAN | 200g Bilderdruck BANNER | BD | 200 | 182 | 100 |  |
| BD_250_BAN | 250g Bilderdruck BANNER | BD | 250 | 231 | 125 |  |
| BD_300_BAN | 300g Bilderdruck BANNER | BD | 300 | 290 | 150 |  |
| N_80_BAN | 80g Natur BANNER | N | 80 | 107 | 60 |  |
| N_120_BAN | 120g Natur BANNER | N | 120 | 173 | 90 |  |
| N_250_BAN | 250g Natur BANNER | N | 250 | 315 | 170 |  |
| N_300_BAN | 300g Natur BANNER | N | 300 | 378 | 210 |  |

Alle Preise: Stand **07/2026** (Guido, 30.07.2026). Keine Platzhalter mehr — R_90 ist final bepreist, N_100_BAN entfällt (nicht lieferbar) zugunsten von N_80_BAN und N_120_BAN.

### 4.1 Zulässige Papiere (formatabhängig)

| Formatgruppe | Inhalt | Umschlag |
|---|---|---|
| A4_Hoch, A5_Quer, A6_Hoch | CC_100, CC_120, CC_160, N_80, N_90, N_100, N_120, BD_115, BD_135, BD_150, BD_170, R_80, R_100 | CC_160, CC_200, CC_250, CC_300, CC_350, N_160, N_200, N_250, N_300, BD_170, BD_200, BD_250, BD_300, BD_350, R_300 |
| A5_Hoch | CC_100, CC_120, CC_160, N_80, N_90, N_120, BD_115, BD_135, BD_150, BD_170, R_90 | CC_160, CC_250, N_160, N_250, BD_170, BD_200, BD_250, BD_300, BD_350 |
| A4_Quer, 30x30 | CC_120_BAN, CC_160_BAN, N_80_BAN, N_120_BAN, BD_135_BAN | CC_160_BAN, CC_250_BAN, CC_300_BAN, N_250_BAN, N_300_BAN, BD_170_BAN, BD_200_BAN, BD_250_BAN, BD_300_BAN |

- **N_160 ist als Inhaltspapier entfernt** (bleibt Umschlag).
- **Familienregel (bestätigt):** Umschlag muss aus derselben Papierfamilie stammen wie der Inhalt — CC↔CC, N↔N, BD↔BD, R↔R. R-Inhalte nur mit R_300-Umschlag; R_300 nicht für N-Inhalte.
- BD-170-Inhalt ist mit allen BD-Umschlägen (BD_170–BD_350) kombinierbar (Freigabe Armin/Guido).
- **Neu (30.07.):** R_300 ist nur als Breitbahn lieferbar und damit für A5 Hoch nicht
  einsetzbar → bei A5 Hoch gibt es keinen Recycling-Umschlag mehr; R_90-Inhalt ist dort
  nur ohne Umschlag bestellbar.

## 5. Berechnungsformeln

### 5.1 Bogenteile & Bogenbedarf (unverändert)

```
bogenteile        = seiten / 4
bogenteileGesamt  = bogenteile + 1  (falls Umschlag)  → Lookup-Schlüssel WV-Tabellen
nettoBogenInhalt  = ceil(auflage × bogenteile / nutzen)     nutzen = formatabhängig (Kap. 2)
nettoBogenUmschlag= ceil(auflage / nutzen)
bogen             = nettoBogen + makulaturBogen   (Kap. 5.2)
```

### 5.2 Makulatur — Prozentmodell (NEU in 2.3.0)

Guidos Formel aus `Makulatur.xlsx` liefert einen **Prozentsatz**, keine Bogenzahl. Er wird
auf die **gedruckten Bogen des gesamten Auftrags** bezogen — Inhalt und Umschlag zusammen —
und beide Komponenten bekommen denselben Faktor.

```
gesamtBogen  = nettoBogenInhalt + nettoBogenUmschlag
makuProzent  = 3 + 2,0092575059 / (gesamtBogen+190,4668326232)^0,08795607978
                 + 1097,938962524 / (gesamtBogen+190,4668326232)
faktor       = 1 + makuProzent / 100
bogen        = round(nettoBogen × faktor)          mindestens nettoBogen + 1
```

Stützpunkte der Kurve: 1 Bogen → 10 % · 100 → 8 % · 1.000 → 5 % · 10.000 → 4 %.

Guidos Rechenbeispiel trifft exakt: 100 Ex., 40 Seiten inkl. Umschlag, A4 → 1.000 Bogen →
Faktor 1,05 → **105 Umschläge / 945 Inhaltsbogen**.

Kaufmännisch gerundet statt aufgerundet: Die gefittete Kurve trifft ihre Stützpunkte nur
auf ~1e-5 genau (bei 1.000 Bogen 5,00003 % statt 5 %); mit Aufrunden käme dort ein ganzer
Extrabogen dazu, der reines Fit-Rauschen wäre. Gedruckt wird nie ohne Anlauf, deshalb
mindestens ein Makulaturbogen je Komponente.

**Aufträge unter 10 Broschüren** werden für die Makulatur wie 10 bemessen (Guido: „die
verhalten sich wie 10, Kompensation über den Verarbeitungspreis"): Die Anlaufmakulatur
fällt unabhängig von der Bestellmenge an, deshalb werden die Makulaturbogen auf der
10er-Basis ermittelt und auf die tatsächliche Netto-Bogenzahl aufgeschlagen. Ab 10
Broschüren ist das identisch mit der direkten Rechnung.

### 5.2a Deckungsbeiträge (unverändert, auf der Netto-Bogenzahl)

```
dbDruck(n)   = 1,5 + 4    / n^0,15
dbPapier(n)  = 1,3 + 0,75 / n^0,2
```

### 5.3 Klick- und Papierkosten (SRA4-Sonderfall entfernt)

```
klickBasis   = baseGrundpreis1c | baseGrundpreis4c
klickBasis  ×= dynFaktorBanner   (nur Banner-Formate)
klickpreis   = (klickBasis + gewichtszuschlag(gsm)) × dbDruck
kostenKlick  = bogen × 2 × klickpreis
kostenPapier = bogen × (preisPro1000 / 1000) × dbPapier
```

Gewichtszuschlag-Stufen (unverändert): ab 79 g/m² → 0 € | ab 120 g/m² → 0,003 € | ab 150 g/m² → 0,006 € | ab 200 g/m² → 0,01 € | ab 250 g/m² → 0,013 € | ab 300 g/m² → 0,018 € | ab 350 g/m² → 0,028 € | ab 400 g/m² → 0,038 €

### 5.4 Seitenlimits — berechnet statt tabelliert (NEU)

Die statischen Limit-Tabellen sind komplett ersetzt. Gilt jetzt für **alle Routen**:

```
maxDicke:  GC (Horizon) = 1500 µm | Kopp/ILDA = 2500 µm
ohne Umschlag: maxSeiten = floor( maxDicke / dickeInhalt ) × 4
mit Umschlag:  maxSeiten = floor( (maxDicke − dickeUmschlag) / dickeInhalt ) × 4
```

Validierte Beispiele: CC100 ohne U Partner = 92 | GC = 56 | CC100+CC160 Partner = 88 |
BD170+BD170 Partner = **56**, GC = **32** (korrigiert die BD-170-Formelfehler der Excel: dort 60/36).
Zusätzlich muss die Bogenteile-Zeile in der WV-Tabelle existieren (GC: max. 48 S. ohne / 44 S. mit Umschlag).

### 5.5 Umschlag-Zuschlag GC (NEU)

```
auflage < 11:  0 €
auflage ≥ 11:  5 € + 0,05 € × auflage
```

Nur GC-Route (Horizon „ohne Rillung des Umschlags"); Kopp/ILDA inkl. Rillung → 0 €. Eigene Position `umschlagZuschlag` im Ergebnis, geht vor dem Express-Aufschlag in die Summe ein.

### 5.6 Cellophanierung (Banner-Faktor NEU)

Nur mit Umschlag, nur Familien CC/BD. Stückpreise pro Umschlagbogen: Glänzend 0,1 € | Matt / kratzfest 0,2 € | Softtouch 0,3 €

```
celloKosten = 20 € + bogenUmschlag × stueckpreis × (isBanner ? 1,5 : 1)
```

### 5.7 WV-Lookup, Gesamtsumme, Gewicht (unverändert)

Tabellen-Lookup über bogenteileGesamt × Auflage mit linearer Interpolation zwischen Staffeln;
unter kleinster Staffel → nicht angeboten; über größter Staffel → Preis der größten Staffel.

```
gesamt = kostenPapier + kostenKlick + wvKosten + celloKosten + umschlagZuschlag + setupKosten
gesamt ×= (1 + expressFaktor)   (falls Express)
gewichtProExemplarG = (bogenteile × gsmInhalt + [1 falls U] × gsmUmschlag) × offenB × offenH / 10^6
```

## 6. Verarbeitungspreis-Tabellen (€ pro Auftrag)

### 6.1 GC (Horizon) — V3 (Data_GC, Stand 30.07.2026), Auflagen 1–500

| Bogenteile \ Auflage | 1 | 2 | 3 | 4 | 5 | 10 | 20 | 50 | 100 | 200 | 300 | 400 | 500 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 5 | 7 | 9 | 11 | 13 | 15 | 20 | 25 | 31,5 | 34,5 | 37,5 | 40,5 | 43,5 |
| 3 | 5 | 8 | 11 | 14 | 16,5 | 19 | 25 | 30 | 38 | 42 | 46 | 50 | 54 |
| 4 | 5 | 9 | 13 | 16 | 20 | 23 | 29 | 35 | 44,5 | 49,5 | 54,5 | 59,5 | 64,5 |
| 5 | 5 | 9 | 13 | 17 | 21 | 25 | 33 | 40 | 51 | 57 | 63 | 69 | 75 |
| 6 | 10 | 14 | 17 | 21 | 25 | 28 | 37,5 | 50 | 57,5 | 64,5 | 71,5 | 78,5 | 85,5 |
| 7 | 10 | 15 | 21 | 26 | 32 | 37 | 48 | 60 | 74 | 82 | 90 | 98 | 106 |
| 8 | 10 | 16 | 22 | 28 | 34 | 40 | 52 | 65 | 80,5 | 89,5 | 98,5 | 107,5 | 116,5 |
| 9 | 15 | 20 | 26 | 31 | 37 | 43 | 56 | 70 | 87 | 97 | 107 | 117 | 127 |
| 10 | 15 | 21,5 | 28 | 34 | 40 | 47 | 60 | 75 | 93,5 | 104,5 | 115,5 | 126,5 | 137,5 |
| 11 | 20 | 26 | 32 | 38 | 44 | 50 | 65 | 80 | 100 | 112 | 124 | 136 | 148 |
| 12 | 20 | 27 | 33 | 39 | 45 | 53 | 70 | 85 | 106,5 | 119,5 | 132,5 | 145,5 | 158,5 |

### 6.2 Partner Kopp (unverändert)

| Bogenteile \ Auflage | 10 | 20 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 69 | 69 | 69 | 69 | 71 | 73 | 75 | 78 | 80 | 82 | 84 | 86 | 88 |
| 3 | 81 | 81 | 81 | 81 | 84 | 87 | 90 | 93 | 96 | 99 | 102 | 105 | 109 |
| 4 | 98 | 98 | 98 | 98 | 102 | 106 | 110 | 114 | 118 | 123 | 127 | 131 | 135 |
| 5 | 109 | 109 | 109 | 109 | 114 | 120 | 125 | 130 | 135 | 140 | 145 | 151 | 156 |
| 6 | 121 | 121 | 121 | 121 | 127 | 133 | 139 | 145 | 152 | 158 | 164 | 170 | 176 |
| 7 | 149 | 149 | 149 | 149 | 156 | 164 | 171 | 178 | 185 | 193 | 200 | 207 | 214 |
| 8 | 161 | 161 | 161 | 161 | 169 | 177 | 185 | 194 | 202 | 210 | 219 | 227 | 235 |
| 9 | 172 | 172 | 172 | 172 | 181 | 191 | 200 | 209 | 219 | 228 | 237 | 246 | 256 |
| 10 | 183 | 183 | 183 | 183 | 194 | 204 | 214 | 225 | 235 | 245 | 256 | 266 | 276 |
| 11 | 195 | 195 | 195 | 195 | 206 | 218 | 229 | 240 | 252 | 263 | 274 | 286 | 297 |
| 12 | 206 | 206 | 206 | 206 | 219 | 231 | 243 | 256 | 268 | 281 | 293 | 305 | 318 |
| 13 | 235 | 235 | 235 | 235 | 248 | 262 | 275 | 289 | 302 | 315 | 329 | 342 | 356 |
| 14 | 246 | 246 | 246 | 246 | 261 | 275 | 290 | 304 | 319 | 333 | 348 | 362 | 377 |
| 15 | 258 | 258 | 258 | 258 | 273 | 289 | 304 | 320 | 335 | 351 | 366 | 382 | 397 |
| 16 | 269 | 269 | 269 | 269 | 285 | 302 | 319 | 335 | 352 | 368 | 385 | 401 | 418 |
| 17 | 280 | 280 | 280 | 280 | 298 | 315 | 333 | 351 | 368 | 386 | 403 | 421 | 439 |
| 18 | 292 | 292 | 292 | 292 | 310 | 329 | 348 | 366 | 385 | 403 | 422 | 441 | 459 |
| 19 | 320 | 320 | 320 | 320 | 340 | 360 | 379 | 399 | 419 | 438 | 458 | 478 | 497 |
| 20 | 332 | 332 | 332 | 332 | 352 | 373 | 394 | 414 | 435 | 456 | 477 | 497 | 518 |
| 21 | 343 | 343 | 343 | 343 | 365 | 387 | 408 | 430 | 452 | 473 | 495 | 517 | 539 |
| 22 | 354 | 354 | 354 | 354 | 377 | 400 | 423 | 446 | 468 | 491 | 514 | 537 | 559 |
| 23 | 366 | 366 | 366 | 366 | 390 | 413 | 437 | 461 | 485 | 509 | 532 | 556 | 580 |
| 24 | 377 | 377 | 377 | 377 | 402 | 427 | 452 | 477 | 501 | 526 | 551 | 576 | 601 |
| 25 | 406 | 406 | 406 | 406 | 432 | 458 | 483 | 509 | 535 | 561 | 587 | 613 | 639 |
| 26 | 417 | 417 | 417 | 417 | 444 | 471 | 498 | 525 | 552 | 579 | 606 | 633 | 659 |
| 27 | 429 | 429 | 429 | 429 | 457 | 485 | 512 | 540 | 568 | 596 | 624 | 652 | 680 |
| 28 | 440 | 440 | 440 | 440 | 469 | 498 | 527 | 556 | 585 | 614 | 643 | 672 | 701 |
| 29 | 451 | 451 | 451 | 451 | 481 | 511 | 541 | 571 | 601 | 632 | 662 | 692 | 722 |
| 30 | 463 | 463 | 463 | 463 | 494 | 525 | 556 | 587 | 618 | 649 | 680 | 711 | 742 |

### 6.3 Partner ILDA — Standardformate, mit Umschlag (unverändert)

| Bogenteile \ Auflage | 100 | 200 | 300 | 400 | 500 |
|---|---|---|---|---|---|
| 2 | 121,8 | 138,6 | 154,2 | 167,4 | 183 |
| 3–5 | 125,4 | 145,8 | 165 | 180,6 | 199,8 |
| 6–9 | 143,4 | 181,8 | 219 | 249 | 275,4 |
| 10–13 | 151,8 | 197,4 | 243 | 279 | 312,6 |
| 14–17 | 157,8 | 209,4 | 258,6 | 291 | 317,4 |
| 18–21 | 165 | 223,8 | 280,2 | 318,6 | 358,2 |
| 22–25 | 178,2 | 243 | 306,6 | 366,6 | 426,6 |

### 6.4 Partner ILDA — Standardformate, ohne Umschlag (unverändert)

| Bogenteile \ Auflage | 100 | 200 | 300 | 400 | 500 |
|---|---|---|---|---|---|
| 2 | 95,8 | 106,6 | 116,2 | 123,4 | 133 |
| 3–5 | 99,4 | 113,8 | 127 | 136,6 | 149,8 |
| 6–9 | 117,4 | 149,8 | 181 | 205 | 225,4 |
| 10–13 | 125,8 | 165,4 | 205 | 235 | 262,6 |
| 14–17 | 131,8 | 177,4 | 220,6 | 247 | 267,4 |
| 18–21 | 139 | 191,8 | 242,2 | 274,6 | 308,2 |
| 22–25 | 152,2 | 211 | 268,6 | 322,6 | 376,6 |

### 6.5 Partner ILDA — Banner, mit Umschlag (unverändert)

| Bogenteile \ Auflage | 10 | 20 | 50 | 100 | 200 | 300 | 400 | 500 |
|---|---|---|---|---|---|---|---|---|
| 2 | 121,8 | 121,8 | 121,8 | 121,8 | 138,6 | 154,2 | 167,4 | 183 |
| 3–5 | 125,4 | 125,4 | 125,4 | 125,4 | 145,8 | 165 | 180,6 | 199,8 |
| 6–9 | 143,4 | 143,4 | 143,4 | 143,4 | 181,8 | 219 | 249 | 275,4 |
| 10–13 | 151,8 | 151,8 | 151,8 | 151,8 | 197,4 | 243 | 279 | 312,6 |
| 14–17 | 157,8 | 157,8 | 157,8 | 157,8 | 209,4 | 258,6 | 291 | 317,4 |
| 18–21 | 165 | 165 | 165 | 165 | 223,8 | 280,2 | 318,6 | 358,2 |
| 22–25 | 178,2 | 178,2 | 178,2 | 178,2 | 243 | 306,6 | 366,6 | 426,6 |

### 6.6 Partner ILDA — Banner, ohne Umschlag (unverändert)

| Bogenteile \ Auflage | 10 | 20 | 50 | 100 | 200 | 300 | 400 | 500 |
|---|---|---|---|---|---|---|---|---|
| 2 | 95,8 | 95,8 | 95,8 | 95,8 | 106,6 | 116,2 | 123,4 | 133 |
| 3–5 | 99,4 | 99,4 | 99,4 | 99,4 | 113,8 | 127 | 136,6 | 149,8 |
| 6–9 | 117,4 | 117,4 | 117,4 | 117,4 | 149,8 | 181 | 205 | 225,4 |
| 10–13 | 125,8 | 125,8 | 125,8 | 125,8 | 165,4 | 205 | 235 | 262,6 |
| 14–17 | 131,8 | 131,8 | 131,8 | 131,8 | 177,4 | 220,6 | 247 | 267,4 |
| 18–21 | 139 | 139 | 139 | 139 | 191,8 | 242,2 | 274,6 | 308,2 |
| 22–25 | 152,2 | 152,2 | 152,2 | 152,2 | 211 | 268,6 | 322,6 | 376,6 |

## 7. Empfehlungslogik (unverändert, jetzt „GC (Horizon)" statt „Intern")

```
1. GC gültig und gcGesamt ≤ günstigster Partner + 20 € → GC (Horizon)
2. sonst: Kopp, wenn koppGesamt ≤ ildaGesamt + 30 € → Kopp, sonst ILDA
3. sonst: einzige bzw. günstigste gültige Route
```

## 8. Wartungs-Backend (NEU)

- Neuer Bereich **/verwaltung** in der App: Papierpreise (pro 1000 Bogen, Platzhalter markiert), alle Settings, editierbare WV-Tabellen.
- Persistenz in `localStorage`; „Auf Standard zurücksetzen" lädt `src/data/pricingConfig.default.json`.
- Export/Import: Gesamt-Config als JSON (validiert Schema, Referenzen, Staffeln, Lückenlosigkeit); Papierpreise als CSV (`id;name;familie;gsm;dicke_um;preis_pro_1000`) und XLSX. Import zeigt Zusammenfassung (geändert/unverändert/unbekannt) vor Übernahme; unbekannte IDs werden nie angelegt.
- Die exportierte JSON ist die Eingangsgröße für den späteren Leadprint-Mapper.

## 9. Referenzberechnungen (mit der neuen Engine erzeugt — für Guidos Kontrolle)

### A4 Hoch, 100 Ex., 24 Seiten, 4/4, CC 120, ohne Umschlag, Standard

```json
{
  "label": "A4 Hoch, 100 Ex., 24 Seiten, 4/4, CC 120, ohne Umschlag, Standard",
  "inputs": {
    "formatKey": "A4_Hoch",
    "auflage": "100",
    "seiten": "24",
    "pInhaltId": "CC_120",
    "dInhaltKey": "4c",
    "hasUmschlag": false,
    "pUmschlagId": "",
    "dUmschlagKey": "4c",
    "celloUmschlag": "ohne",
    "produktionszeit": "standard"
  },
  "recommendedName": "GC (Horizon)",
  "results": [
    {
      "name": "GC (Horizon)",
      "gesamt": 288.28,
      "stueckPreis": 2.8828,
      "nutzen": 1,
      "maxSeiten": 44,
      "nettoBogenInhalt": 600,
      "bogenInhalt": 633,
      "bogenUmschlag": 0,
      "makulaturInhalt": 33,
      "makulaturUmschlag": 0,
      "makulaturProzent": 5.51,
      "kostenPapierGesamt": 50.71,
      "kostenKlickGesamt": 165.07,
      "wvKosten": 57.5,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 89.81,
      "weightTotalKg": 8.98,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner Kopp",
      "gesamt": 351.78,
      "stueckPreis": 3.5178,
      "nutzen": 1,
      "maxSeiten": 76,
      "nettoBogenInhalt": 600,
      "bogenInhalt": 633,
      "bogenUmschlag": 0,
      "makulaturInhalt": 33,
      "makulaturUmschlag": 0,
      "makulaturProzent": 5.51,
      "kostenPapierGesamt": 50.71,
      "kostenKlickGesamt": 165.07,
      "wvKosten": 121,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 89.81,
      "weightTotalKg": 8.98,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner ILDA",
      "gesamt": 348.18,
      "stueckPreis": 3.4818,
      "nutzen": 1,
      "maxSeiten": 76,
      "nettoBogenInhalt": 600,
      "bogenInhalt": 633,
      "bogenUmschlag": 0,
      "makulaturInhalt": 33,
      "makulaturUmschlag": 0,
      "makulaturProzent": 5.51,
      "kostenPapierGesamt": 50.71,
      "kostenKlickGesamt": 165.07,
      "wvKosten": 117.4,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 89.81,
      "weightTotalKg": 8.98,
      "produktionszeitWT": 4
    }
  ]
}
```

### A4 Hoch, 300 Ex., 32 Seiten, 4/4, CC 120 + Umschlag CC 300, Cello matt, Standard (inkl. Umschlag-Zuschlag)

```json
{
  "label": "A4 Hoch, 300 Ex., 32 Seiten, 4/4, CC 120 + Umschlag CC 300, Cello matt, Standard (inkl. Umschlag-Zuschlag)",
  "inputs": {
    "formatKey": "A4_Hoch",
    "auflage": "300",
    "seiten": "32",
    "pInhaltId": "CC_120",
    "dInhaltKey": "4c",
    "hasUmschlag": true,
    "pUmschlagId": "CC_300",
    "dUmschlagKey": "4c",
    "celloUmschlag": "matt",
    "produktionszeit": "standard"
  },
  "recommendedName": "GC (Horizon)",
  "results": [
    {
      "name": "GC (Horizon)",
      "gesamt": 1192.86,
      "stueckPreis": 3.9762,
      "nutzen": 1,
      "maxSeiten": 36,
      "nettoBogenInhalt": 2400,
      "bogenInhalt": 2505,
      "bogenUmschlag": 313,
      "makulaturInhalt": 105,
      "makulaturUmschlag": 13,
      "makulaturProzent": 4.38,
      "kostenPapierGesamt": 260.8,
      "kostenKlickGesamt": 707.46,
      "wvKosten": 107,
      "umschlagZuschlag": 20,
      "celloKosten": 82.6,
      "celloStueckpreis": 0.2,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 157.17,
      "weightTotalKg": 47.15,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner Kopp",
      "gesamt": 1256.86,
      "stueckPreis": 4.1895,
      "nutzen": 1,
      "maxSeiten": 68,
      "nettoBogenInhalt": 2400,
      "bogenInhalt": 2505,
      "bogenUmschlag": 313,
      "makulaturInhalt": 105,
      "makulaturUmschlag": 13,
      "makulaturProzent": 4.38,
      "kostenPapierGesamt": 260.8,
      "kostenKlickGesamt": 707.46,
      "wvKosten": 191,
      "umschlagZuschlag": 0,
      "celloKosten": 82.6,
      "celloStueckpreis": 0.2,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 157.17,
      "weightTotalKg": 47.15,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner ILDA",
      "gesamt": 1284.86,
      "stueckPreis": 4.2829,
      "nutzen": 1,
      "maxSeiten": 68,
      "nettoBogenInhalt": 2400,
      "bogenInhalt": 2505,
      "bogenUmschlag": 313,
      "makulaturInhalt": 105,
      "makulaturUmschlag": 13,
      "makulaturProzent": 4.38,
      "kostenPapierGesamt": 260.8,
      "kostenKlickGesamt": 707.46,
      "wvKosten": 219,
      "umschlagZuschlag": 0,
      "celloKosten": 82.6,
      "celloStueckpreis": 0.2,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 157.17,
      "weightTotalKg": 47.15,
      "produktionszeitWT": 4
    }
  ]
}
```

### A6 Hoch, 100 Ex., 24 Seiten, 4/4, CC 120, ohne Umschlag, Standard

```json
{
  "label": "A6 Hoch, 100 Ex., 24 Seiten, 4/4, CC 120, ohne Umschlag, Standard",
  "inputs": {
    "formatKey": "A6_Hoch",
    "auflage": "100",
    "seiten": "24",
    "pInhaltId": "CC_120",
    "dInhaltKey": "4c",
    "hasUmschlag": false,
    "pUmschlagId": "",
    "dUmschlagKey": "4c",
    "celloUmschlag": "ohne",
    "produktionszeit": "standard"
  },
  "recommendedName": "GC (Horizon)",
  "results": [
    {
      "name": "GC (Horizon)",
      "gesamt": 132.86,
      "stueckPreis": 1.3286,
      "nutzen": 4,
      "maxSeiten": 44,
      "nettoBogenInhalt": 150,
      "bogenInhalt": 161,
      "bogenUmschlag": 0,
      "makulaturInhalt": 11,
      "makulaturUmschlag": 0,
      "makulaturProzent": 7.43,
      "kostenPapierGesamt": 13.47,
      "kostenKlickGesamt": 46.89,
      "wvKosten": 57.5,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 22.38,
      "weightTotalKg": 2.24,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner Kopp",
      "gesamt": 196.36,
      "stueckPreis": 1.9636,
      "nutzen": 4,
      "maxSeiten": 76,
      "nettoBogenInhalt": 150,
      "bogenInhalt": 161,
      "bogenUmschlag": 0,
      "makulaturInhalt": 11,
      "makulaturUmschlag": 0,
      "makulaturProzent": 7.43,
      "kostenPapierGesamt": 13.47,
      "kostenKlickGesamt": 46.89,
      "wvKosten": 121,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 22.38,
      "weightTotalKg": 2.24,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner ILDA",
      "error": "Format wird von diesem Produzenten nicht unterstützt."
    }
  ]
}
```

### A5 Hoch, 50 Ex., 16 Seiten, 1/1, N 90, ohne Umschlag, Express

```json
{
  "label": "A5 Hoch, 50 Ex., 16 Seiten, 1/1, N 90, ohne Umschlag, Express",
  "inputs": {
    "formatKey": "A5_Hoch",
    "auflage": "50",
    "seiten": "16",
    "pInhaltId": "N_90",
    "dInhaltKey": "1c",
    "hasUmschlag": false,
    "pUmschlagId": "",
    "dUmschlagKey": "4c",
    "celloUmschlag": "ohne",
    "produktionszeit": "express"
  },
  "recommendedName": "GC (Horizon)",
  "results": [
    {
      "name": "GC (Horizon)",
      "gesamt": 73.89,
      "stueckPreis": 1.4778,
      "nutzen": 2,
      "maxSeiten": 48,
      "nettoBogenInhalt": 100,
      "bogenInhalt": 108,
      "bogenUmschlag": 0,
      "makulaturInhalt": 8,
      "makulaturUmschlag": 0,
      "makulaturProzent": 8,
      "kostenPapierGesamt": 5.82,
      "kostenKlickGesamt": 11.36,
      "wvKosten": 35,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 6.72,
      "weightPerCopyG": 22.38,
      "weightTotalKg": 1.12,
      "produktionszeitWT": 2
    },
    {
      "name": "Partner Kopp",
      "gesamt": 143.19,
      "stueckPreis": 2.8638,
      "nutzen": 2,
      "maxSeiten": 84,
      "nettoBogenInhalt": 100,
      "bogenInhalt": 108,
      "bogenUmschlag": 0,
      "makulaturInhalt": 8,
      "makulaturUmschlag": 0,
      "makulaturProzent": 8,
      "kostenPapierGesamt": 5.82,
      "kostenKlickGesamt": 11.36,
      "wvKosten": 98,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 13.02,
      "weightPerCopyG": 22.38,
      "weightTotalKg": 1.12,
      "produktionszeitWT": 2
    },
    {
      "name": "Partner ILDA",
      "error": "Auflage/Umfang bei Partner ILDA nicht in Preistabelle hinterlegt."
    }
  ]
}
```

### 30 × 30 Banner, 150 Ex., 20 Seiten, 4/4, CC 120 BAN + Umschlag CC 250 BAN, Cello matt (Banner-Faktor 1,5), Standard

```json
{
  "label": "30 × 30 Banner, 150 Ex., 20 Seiten, 4/4, CC 120 BAN + Umschlag CC 250 BAN, Cello matt (Banner-Faktor 1,5), Standard",
  "inputs": {
    "formatKey": "30x30",
    "auflage": "150",
    "seiten": "20",
    "pInhaltId": "CC_120_BAN",
    "dInhaltKey": "4c",
    "hasUmschlag": true,
    "pUmschlagId": "CC_250_BAN",
    "dUmschlagKey": "4c",
    "celloUmschlag": "matt",
    "produktionszeit": "standard"
  },
  "recommendedName": "Partner ILDA",
  "results": [
    {
      "name": "GC (Horizon)",
      "error": "Format wird von diesem Produzenten nicht unterstützt."
    },
    {
      "name": "Partner Kopp",
      "error": "Format wird von diesem Produzenten nicht unterstützt."
    },
    {
      "name": "Partner ILDA",
      "gesamt": 756.96,
      "stueckPreis": 5.0464,
      "nutzen": 1,
      "maxSeiten": 68,
      "nettoBogenInhalt": 750,
      "bogenInhalt": 788,
      "bogenUmschlag": 158,
      "makulaturInhalt": 38,
      "makulaturUmschlag": 8,
      "makulaturProzent": 5.09,
      "kostenPapierGesamt": 137.78,
      "kostenKlickGesamt": 374.18,
      "wvKosten": 162.6,
      "umschlagZuschlag": 0,
      "celloKosten": 67.4,
      "celloStueckpreis": 0.3,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 153,
      "weightTotalKg": 22.95,
      "produktionszeitWT": 4
    }
  ]
}
```

### Kleinmenge: A4 Hoch, 1 Ex., 20 Seiten, 1/1, N 80, ohne Umschlag, Standard (Guidos Zielpreis ~25 €)

```json
{
  "label": "Kleinmenge: A4 Hoch, 1 Ex., 20 Seiten, 1/1, N 80, ohne Umschlag, Standard (Guidos Zielpreis ~25 €)",
  "inputs": {
    "formatKey": "A4_Hoch",
    "auflage": "1",
    "seiten": "20",
    "pInhaltId": "N_80",
    "dInhaltKey": "1c",
    "hasUmschlag": false,
    "pUmschlagId": "",
    "dUmschlagKey": "4c",
    "celloUmschlag": "ohne",
    "produktionszeit": "standard"
  },
  "recommendedName": "GC (Horizon)",
  "results": [
    {
      "name": "GC (Horizon)",
      "gesamt": 21.75,
      "stueckPreis": 21.7511,
      "nutzen": 1,
      "maxSeiten": 56,
      "nettoBogenInhalt": 5,
      "bogenInhalt": 9,
      "bogenUmschlag": 0,
      "makulaturInhalt": 4,
      "makulaturUmschlag": 0,
      "makulaturProzent": 8.81,
      "kostenPapierGesamt": 0.5,
      "kostenKlickGesamt": 1.25,
      "wvKosten": 5,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 49.9,
      "weightTotalKg": 0.05,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner Kopp",
      "error": "Partner Kopp ist erst ab 10 Exemplaren möglich."
    },
    {
      "name": "Partner ILDA",
      "error": "Auflage/Umfang bei Partner ILDA nicht in Preistabelle hinterlegt."
    }
  ]
}
```

> **Hinweis zur Kleinmenge:** Bis 2.2.0 lag dieser Fall bei 22,92 €, jetzt bei 21,75 €.
> Die alte Absolut-Makulatur gab 5 Netto-Bogen ganze 9 Makulaturbogen — das war der
> eigentliche Kleinmengenpuffer. Mit dem Prozentmodell fällt er weg; die vier
> Kleinmengen-Zielpreise (25 / 30 / 30 / 35 €) werden jetzt um 2,5–7 € unterschritten.
> Guidos eigener Satz dazu lautet „Kompensation über den Verarbeitungspreis" — dafür
> müssten die Kleinststaffeln der GC-Verarbeitungstabelle angehoben werden. **Offene
> Frage an Guido.**

---

*Generiert am 2026-08-06 direkt aus `pricingConfig.default.json` (Version 2.3.0) und der produktiven Engine.*
