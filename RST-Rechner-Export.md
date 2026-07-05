# RST-Rechner — Kompletter Export der Berechnungslogik (Rückstichheftung)

> **Version 2.0.0 · Stand 2026-07-06.** Ersetzt den Export vom 2026-07-05.
> Umgesetzt: Update-Spec Rev. 2 vom 06.07.2026 (GC Horizon, DIN A6, berechnete Seitenlimits,
> GC-Umschlag-Zuschlag, Cello-Banner-Faktor, zentrale versionierte Config).
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
| Partner Kopp | Fremdvergabe | 3 WT | 2 WT | A6_Hoch, A5_Hoch, A5_Quer, A4_Hoch | 10+ |
| Partner ILDA | Fremdvergabe | 4 WT | 3 WT | A5_Hoch, A5_Quer, A4_Hoch, A4_Quer, 30x30 | — (lt. Tabelle) |

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
| N_80 | 80g Natur | N | 80 | 107 | 24 |  |
| N_90 | 90g Natur | N | 90 | 119 | 27 |  |
| N_100 | 100g Natur | N | 100 | 131 | 36 |  |
| N_120 | 120g Natur | N | 120 | 173 | 44 |  |
| N_160 | 160g Natur | N | 160 | 202 | 70 |  |
| N_200 | 200g Natur | N | 200 | 252 | 82 |  |
| N_250 | 250g Natur | N | 250 | 315 | 102 |  |
| N_300 | 300g Natur | N | 300 | 378 | 122 |  |
| BD_115 | 115g Bilderdruck | BD | 115 | 96 | 33 |  |
| BD_135 | 135g Bilderdruck | BD | 135 | 117 | 40 |  |
| BD_150 | 150g Bilderdruck | BD | 150 | 132 | 48 |  |
| BD_170 | 170g Bilderdruck | BD | 170 | 159 | 56 |  |
| BD_200 | 200g Bilderdruck | BD | 200 | 182 | 64 |  |
| BD_250 | 250g Bilderdruck | BD | 250 | 231 | 84 |  |
| BD_300 | 300g Bilderdruck | BD | 300 | 290 | 102 |  |
| BD_350 | 350g Bilderdruck | BD | 350 | 350 | 128 |  |
| CC_100 | 100g ColorCopy | CC | 100 | 106 | 35 |  |
| CC_120 | 120g ColorCopy | CC | 120 | 126 | 42 |  |
| CC_160 | 160g ColorCopy | CC | 160 | 166 | 59 |  |
| CC_200 | 200g ColorCopy | CC | 200 | 200 | 72 |  |
| CC_250 | 250g ColorCopy | CC | 250 | 245 | 90 |  |
| CC_300 | 300g ColorCopy | CC | 300 | 305 | 120 |  |
| CC_350 | 350g ColorCopy | CC | 350 | 350 | 150 |  |
| R_80 | 80g Recycling | R | 80 | 104 | 35 |  |
| R_90 | 90g Recycling | R | 90 | 116 | 40 | **[PLATZHALTER]** |
| R_100 | 100g Recycling | R | 100 | 127 | 45 |  |
| R_300 | 300g Recycling | R | 300 | 380 | 135 |  |
| CC_120_BAN | 120g ColorCopy BANNER | CC | 120 | 126 | 75 |  |
| CC_160_BAN | 160g ColorCopy BANNER | CC | 160 | 166 | 100 |  |
| CC_250_BAN | 250g ColorCopy BANNER | CC | 250 | 245 | 155 |  |
| CC_300_BAN | 300g ColorCopy BANNER | CC | 300 | 305 | 185 |  |
| BD_135_BAN | 135g Bilderdruck BANNER | BD | 135 | 117 | 70 |  |
| BD_170_BAN | 170g Bilderdruck BANNER | BD | 170 | 159 | 85 |  |
| BD_200_BAN | 200g Bilderdruck BANNER | BD | 200 | 182 | 100 |  |
| BD_250_BAN | 250g Bilderdruck BANNER | BD | 250 | 231 | 125 |  |
| BD_300_BAN | 300g Bilderdruck BANNER | BD | 300 | 290 | 150 |  |
| N_100_BAN | 100g Natur BANNER | N | 100 | 131 | 90 | **[PLATZHALTER]** |
| N_250_BAN | 250g Natur BANNER | N | 250 | 315 | 150 |  |
| N_300_BAN | 300g Natur BANNER | N | 300 | 378 | 200 |  |

**[PLATZHALTER]**: R_90 (Preis fehlt im PAPIER-Blatt) und N_100_BAN (Namens-/Preisklärung „80g vs. 100g Natur BANNER") — mit Guido zu klären; im UI markiert.

### 4.1 Zulässige Papiere (formatabhängig)

| Formatgruppe | Inhalt | Umschlag |
|---|---|---|
| A4_Hoch, A5_Quer, A6_Hoch | CC_100, CC_120, CC_160, N_80, N_90, N_100, N_120, BD_115, BD_135, BD_150, BD_170, R_80, R_100 | CC_160, CC_200, CC_250, CC_300, CC_350, N_160, N_200, N_250, N_300, BD_170, BD_200, BD_250, BD_300, BD_350, R_300 |
| A5_Hoch | CC_100, CC_120, CC_160, N_80, N_90, N_120, BD_115, BD_135, BD_150, BD_170, R_90 | CC_160, CC_250, N_160, N_250, BD_170, BD_200, BD_250, BD_300, BD_350, R_300 |
| A4_Quer, 30x30 | CC_120_BAN, CC_160_BAN, N_100_BAN, BD_135_BAN | CC_160_BAN, CC_250_BAN, CC_300_BAN, N_250_BAN, N_300_BAN, BD_170_BAN, BD_200_BAN, BD_250_BAN, BD_300_BAN |

- **N_160 ist als Inhaltspapier entfernt** (bleibt Umschlag).
- **Familienregel (bestätigt):** Umschlag muss aus derselben Papierfamilie stammen wie der Inhalt — CC↔CC, N↔N, BD↔BD, R↔R. R-Inhalte nur mit R_300-Umschlag; R_300 nicht für N-Inhalte.
- BD-170-Inhalt ist mit allen BD-Umschlägen (BD_170–BD_350) kombinierbar (Freigabe Armin/Guido).

## 5. Berechnungsformeln

### 5.1 Bogenteile & Bogenbedarf (unverändert)

```
bogenteile        = seiten / 4
bogenteileGesamt  = bogenteile + 1  (falls Umschlag)  → Lookup-Schlüssel WV-Tabellen
nettoBogenInhalt  = ceil(auflage × bogenteile / nutzen)     nutzen = formatabhängig (Kap. 2)
nettoBogenUmschlag= ceil(auflage / nutzen)
bogen             = nettoBogen + makulatur(nettoBogen)
```

### 5.2 Makulatur & Deckungsbeiträge (unverändert)

```
makulatur(n) = ceil( 3 + 2,0092575059 / (n+190,4668326232)^0,08795607978 + 1097,938962524 / (n+190,4668326232) )
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

### 6.1 GC (Horizon) — NEU (Data_GC, Stand 29.03.2026), Auflagen 1–500

| Bogenteile \ Auflage | 1 | 2 | 3 | 4 | 5 | 10 | 20 | 50 | 100 | 200 | 300 | 400 | 500 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 5 | 7 | 9 | 11 | 13 | 15 | 20 | 25 | 30 | 31,8 | 33,6 | 35,4 | 37,2 |
| 3 | 5 | 7,5 | 10 | 12,5 | 15 | 17,5 | 23 | 29 | 35 | 37,7 | 40,4 | 43,1 | 45,8 |
| 4 | 5 | 8 | 11 | 14 | 17 | 20 | 26 | 33 | 40 | 43,6 | 47,2 | 50,8 | 54,4 |
| 5 | 5 | 8,4 | 11,8 | 15,2 | 18,6 | 22 | 27,5 | 37 | 45 | 49,5 | 54 | 58,5 | 63 |
| 6 | 10 | 13,2 | 16,4 | 19,6 | 22,8 | 26 | 35 | 41,5 | 50 | 55,4 | 60,8 | 66,2 | 71,6 |
| 7 | 10 | 14 | 18 | 22 | 26 | 30 | 40 | 50 | 60 | 66,3 | 72,6 | 78,9 | 85,2 |
| 8 | 10 | 14,6 | 19,2 | 23,8 | 28,4 | 33 | 43,5 | 54 | 65 | 72,2 | 79,4 | 86,6 | 93,8 |
| 9 | 15 | 18,9 | 22,8 | 26,7 | 30,6 | 34,5 | 46 | 58 | 70 | 78,1 | 86,2 | 94,3 | 102,4 |
| 10 | 15 | 19,5 | 24 | 28,5 | 33 | 37,5 | 50 | 62 | 75 | 84 | 93 | 102 | 111 |
| 11 | 20 | 24 | 28 | 32 | 36 | 40 | 53 | 66 | 80 | 89,9 | 99,8 | 109,7 | 119,6 |
| 12 | 20 | 24,4 | 28,8 | 33,2 | 37,6 | 42 | 56 | 70 | 85 | 95,8 | 106,6 | 117,4 | 128,2 |

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
      "gesamt": 261.43,
      "stueckPreis": 2.6143,
      "nutzen": 1,
      "maxSeiten": 44,
      "nettoBogenInhalt": 600,
      "bogenInhalt": 606,
      "bogenUmschlag": 0,
      "makulaturInhalt": 6,
      "makulaturUmschlag": 0,
      "kostenPapierGesamt": 38.4,
      "kostenKlickGesamt": 158.03,
      "wvKosten": 50,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 89.8,
      "weightTotalKg": 8.98,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner Kopp",
      "gesamt": 332.43,
      "stueckPreis": 3.3243,
      "nutzen": 1,
      "maxSeiten": 76,
      "nettoBogenInhalt": 600,
      "bogenInhalt": 606,
      "bogenUmschlag": 0,
      "makulaturInhalt": 6,
      "makulaturUmschlag": 0,
      "kostenPapierGesamt": 38.4,
      "kostenKlickGesamt": 158.03,
      "wvKosten": 121,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 89.8,
      "weightTotalKg": 8.98,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner ILDA",
      "gesamt": 328.83,
      "stueckPreis": 3.2883,
      "nutzen": 1,
      "maxSeiten": 76,
      "nettoBogenInhalt": 600,
      "bogenInhalt": 606,
      "bogenUmschlag": 0,
      "makulaturInhalt": 6,
      "makulaturUmschlag": 0,
      "kostenPapierGesamt": 38.4,
      "kostenKlickGesamt": 158.03,
      "wvKosten": 117.4,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 89.8,
      "weightTotalKg": 8.98,
      "produktionszeitWT": 4
    }
  ]
}
```

### A4 Hoch, 300 Ex., 32 Seiten, 4/4, CC 120 + Umschlag CC 300, Cello matt, Standard (GC jetzt bis 500 möglich, inkl. Umschlag-Zuschlag)

```json
{
  "label": "A4 Hoch, 300 Ex., 32 Seiten, 4/4, CC 120 + Umschlag CC 300, Cello matt, Standard (GC jetzt bis 500 möglich, inkl. Umschlag-Zuschlag)",
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
      "gesamt": 1088.24,
      "stueckPreis": 3.6275,
      "nutzen": 1,
      "maxSeiten": 36,
      "nettoBogenInhalt": 2400,
      "bogenInhalt": 2405,
      "bogenUmschlag": 307,
      "makulaturInhalt": 5,
      "makulaturUmschlag": 7,
      "kostenPapierGesamt": 204.01,
      "kostenKlickGesamt": 681.63,
      "wvKosten": 86.2,
      "umschlagZuschlag": 20,
      "celloKosten": 81.4,
      "celloStueckpreis": 0.2,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 157.2,
      "weightTotalKg": 47.15,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner Kopp",
      "gesamt": 1173.04,
      "stueckPreis": 3.9101,
      "nutzen": 1,
      "maxSeiten": 68,
      "nettoBogenInhalt": 2400,
      "bogenInhalt": 2405,
      "bogenUmschlag": 307,
      "makulaturInhalt": 5,
      "makulaturUmschlag": 7,
      "kostenPapierGesamt": 204.01,
      "kostenKlickGesamt": 681.63,
      "wvKosten": 191,
      "umschlagZuschlag": 0,
      "celloKosten": 81.4,
      "celloStueckpreis": 0.2,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 157.2,
      "weightTotalKg": 47.15,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner ILDA",
      "gesamt": 1201.04,
      "stueckPreis": 4.0035,
      "nutzen": 1,
      "maxSeiten": 68,
      "nettoBogenInhalt": 2400,
      "bogenInhalt": 2405,
      "bogenUmschlag": 307,
      "makulaturInhalt": 5,
      "makulaturUmschlag": 7,
      "kostenPapierGesamt": 204.01,
      "kostenKlickGesamt": 681.63,
      "wvKosten": 219,
      "umschlagZuschlag": 0,
      "celloKosten": 81.4,
      "celloStueckpreis": 0.2,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 157.2,
      "weightTotalKg": 47.15,
      "produktionszeitWT": 4
    }
  ]
}
```

### A6 Hoch (NEU), 100 Ex., 24 Seiten, 4/4, CC 120, ohne Umschlag, Standard

```json
{
  "label": "A6 Hoch (NEU), 100 Ex., 24 Seiten, 4/4, CC 120, ohne Umschlag, Standard",
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
      "gesamt": 121.47,
      "stueckPreis": 1.2147,
      "nutzen": 4,
      "maxSeiten": 44,
      "nettoBogenInhalt": 150,
      "bogenInhalt": 158,
      "bogenUmschlag": 0,
      "makulaturInhalt": 8,
      "makulaturUmschlag": 0,
      "kostenPapierGesamt": 10.45,
      "kostenKlickGesamt": 46.02,
      "wvKosten": 50,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 22.4,
      "weightTotalKg": 2.24,
      "produktionszeitWT": 3
    },
    {
      "name": "Partner Kopp",
      "gesamt": 192.47,
      "stueckPreis": 1.9247,
      "nutzen": 4,
      "maxSeiten": 76,
      "nettoBogenInhalt": 150,
      "bogenInhalt": 158,
      "bogenUmschlag": 0,
      "makulaturInhalt": 8,
      "makulaturUmschlag": 0,
      "kostenPapierGesamt": 10.45,
      "kostenKlickGesamt": 46.02,
      "wvKosten": 121,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 0,
      "weightPerCopyG": 22.4,
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

### A5 Hoch, 50 Ex., 16 Seiten, 1/1, N 90, ohne Umschlag, Express (kein SRA4-Sonderfall mehr)

```json
{
  "label": "A5 Hoch, 50 Ex., 16 Seiten, 1/1, N 90, ohne Umschlag, Express (kein SRA4-Sonderfall mehr)",
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
      "gesamt": 70.58,
      "stueckPreis": 1.4116,
      "nutzen": 2,
      "maxSeiten": 48,
      "nettoBogenInhalt": 100,
      "bogenInhalt": 109,
      "bogenUmschlag": 0,
      "makulaturInhalt": 9,
      "makulaturUmschlag": 0,
      "kostenPapierGesamt": 4.7,
      "kostenKlickGesamt": 11.46,
      "wvKosten": 33,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 6.42,
      "weightPerCopyG": 22.4,
      "weightTotalKg": 1.12,
      "produktionszeitWT": 2
    },
    {
      "name": "Partner Kopp",
      "gesamt": 142.08,
      "stueckPreis": 2.8416,
      "nutzen": 2,
      "maxSeiten": 84,
      "nettoBogenInhalt": 100,
      "bogenInhalt": 109,
      "bogenUmschlag": 0,
      "makulaturInhalt": 9,
      "makulaturUmschlag": 0,
      "kostenPapierGesamt": 4.7,
      "kostenKlickGesamt": 11.46,
      "wvKosten": 98,
      "umschlagZuschlag": 0,
      "celloKosten": 0,
      "celloStueckpreis": 0,
      "setupKosten": 15,
      "expressSurcharge": 12.92,
      "weightPerCopyG": 22.4,
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
      "gesamt": 730.76,
      "stueckPreis": 4.8717,
      "nutzen": 1,
      "maxSeiten": 68,
      "nettoBogenInhalt": 750,
      "bogenInhalt": 756,
      "bogenUmschlag": 158,
      "makulaturInhalt": 6,
      "makulaturUmschlag": 8,
      "kostenPapierGesamt": 123.6,
      "kostenKlickGesamt": 362.16,
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

### Kleinmenge: A4 Hoch, 1 Ex., 20 Seiten, 1/1, N 80, ohne Umschlag, Standard (Zielpreis ~25 €)

```json
{
  "label": "Kleinmenge: A4 Hoch, 1 Ex., 20 Seiten, 1/1, N 80, ohne Umschlag, Standard (Zielpreis ~25 €)",
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
      "gesamt": 22.75,
      "stueckPreis": 22.7526,
      "nutzen": 1,
      "maxSeiten": 56,
      "nettoBogenInhalt": 5,
      "bogenInhalt": 15,
      "bogenUmschlag": 0,
      "makulaturInhalt": 10,
      "makulaturUmschlag": 0,
      "kostenPapierGesamt": 0.66,
      "kostenKlickGesamt": 2.09,
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

---

*Generiert am 2026-07-06 direkt aus `pricingConfig.default.json` (Version 2.0.0) und der produktiven Engine.*
