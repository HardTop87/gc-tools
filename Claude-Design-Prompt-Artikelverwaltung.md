# Prompt für Claude Design — Artikelverwaltung & Preisrechner-UI in gc-tools

> Kopiere ab der Linie unten alles in Claude Design. Die Datei `design_handoff_gc_tools_ui/GC Tools Redesign.dc.html` (lokal im Repo, nicht in Git) ist der bestehende Design-Stand und sollte als Anhang mitgegeben werden, ebenso ein Screenshot der heutigen Verwaltung und des RST-Rechners.

---

## Kontext

Ich betreibe **gc-tools**, eine interne Web-App für eine Druckerei (GC). Stack: React 19, Vite, react-router 7, Tailwind 3 mit CSS-Variablen-Tokens (hell/dunkel), lucide-react Icons, Vitest. Deployment auf Vercel, eine serverless Function `api/config.mjs` speichert die Kalkulationsbasis als versionierte JSON-Revisionen in Vercel Blob. Sprache der Oberfläche: Deutsch, Du-Form vermeiden, nüchtern-sachlich.

Die App hat heute vier Bereiche (Dashboard mit Kacheln):

1. **RST Rechner** — Preisrechner für Rückstichheftung (Broschüren). Eingaben: Endformat, Auflage, Seiten, Inhaltspapier, Inhaltsdruck (1c/4c), optional Umschlag (Papier, Druck, Cellophanierung), Produktionszeit (Standard/Express). Die Engine rechnet drei Produktionsrouten durch (eigene Maschine „GC Horizon", Partner Kopp, Partner ILDA) und empfiehlt eine Route. Ergebnis: Gesamtpreis, Stückpreis, Aufschlüsselung je Route (Papier, Klick, Weiterverarbeitung, Umschlag-Zuschlag, Dickenaufschlag, Einrichtekosten, Express), Produktionszeit, Makulatur, Buchdicke.
2. **Verwaltung** — Editor für die Kalkulationsbasis mit Entwurf/Veröffentlichen, Revisionsverlauf, Wiederherstellen, „Auf Standard zurücksetzen", Konfliktbehandlung bei parallelen Änderungen (409). Gegliedert in Scopes: **Gemeinsame Basis** (Tabs: Papierpreise, Klick & Bogen, Veredelung & Auftrag) und **Rückstichheftung** (Tabs: Faktoren & Grenzen, Verarbeitungstabellen). Weitere Scopes sind als „geplant" angelegt: Flyer, Poster, Abschlussarbeiten.
3. **PayPal Export** — Abgleich PayPal-Gebühren gegen Shop-Bestellungen. **Dieser Bereich bleibt unverändert.** Nicht anfassen, nicht neu gestalten, nur ggf. die gemeinsame Navigation/TopBar darf sich ändern.
4. **Rhaetia-Post-Manager** — Portoberechnung für Postversand. Ebenfalls nicht Teil dieses Auftrags.

### Datenmodell der Kalkulationsbasis (vereinfacht, heute)

```
settings:   globale Zahlen (Klick-Grundpreis 1c/4c je SRA3-Seite, Einrichtekosten,
            Cello-Grundkosten, Express-Faktor, GC-Umschlagzuschlag, Dickenaufschlag,
            Kassen-Anker für 1–10 Exemplare, Empfehlungs-Toleranzen)
papiere:    ~40 Papiere (id, Name, Familie, Grammatur, Dicke µm, Preis pro 1000 Bogen,
            Banner-/Platzhalter-Flags) — EINE zentrale Papierdatenbank
gewichtszuschlaege: Klick-Zuschlag je Grammaturstufe
formate:    6 Formate (A4 Hoch, A5 Hoch, A5 Quer, A6 Hoch, A4 Quer Banner, 30x30 Banner)
            mit Nutzen je Route und je Format freigeschaltete Inhalts-/Umschlagpapiere
routen:     3 Produktionsrouten mit Produktionszeit, Auflagenbereich, Flags
wvTabellen: Weiterverarbeitungspreise je Route × Bogen-Anzahl × Auflagenstaffel
cello:      erlaubte Papierfamilien, Veredelungsarten mit Stückpreis
umschlagAusnahmen: welche Inhaltspapiere bestimmte Umschlagpapiere ausschließen
```

### Was im Online-Shop passiert (Leadprint / be.print Druckshop)

Der Shop hat keine Formel-Kalkulation, sondern pro Artikel eine **Preistabelle** (Papier × Auflagenstaffel) plus **Optionsaufschläge** (z. B. je Seitenzahl). Aus der Kalkulationsbasis erzeugt ein Mapper diese Preiszeilen und schreibt sie in Import-Dateien (XLSX), die ich im Shop-Backend hochlade. Für Rückstichheftung gibt es 16 Shop-Artikel (4 Formate × 1c/4c × ohne/mit Umschlag); nur die 4/4-ohne-Umschlag-Artikel sind in der Warengruppe sichtbar, die anderen werden per Weiterleitung erreicht.

Zusätzlich hat jeder Shop-Artikel eigene Preisfelder, die **nur im Shop** wirken und heute dort einzeln gepflegt werden müssen:

- **Grundaufschlag** in Prozent auf alle Preise und Optionen (intern „PayPal-Aufschlag", heute 3 %; Shop-Feld `glob_artikel_rabatt`, Typ „aufschlag")
- **Aufschläge für Weiterverarbeitung und Services** als Festbeträge je Artikel: Rillen, Perforieren, Nummerieren, Cellophanierung, Logoeindruck, Korrekturabzug, Farbproof, 24h-Service, Standard-Rückseite, freie Eingabe
- **Versand-Aufschläge** je Artikel: Normalpaket, Expresspaket, Selbstabholung, freie Eingabe Versand
- **Grundwerte**: Mindestauflage, Mindestpreis, Artikelfestpreis, Produktionszeit in Tagen, Grundauflage/Grundanzahl, Gewicht
- **Sichtbarkeit** (unsichtbar ja/nein), Bezeichnung, Artikelnummer, Shop-Artikel-ID

## Ziel

Ich will **alle Produkte, die wir im Shop haben oder planen, in der App administrieren** und Preisänderungen zentral ausrollen: Ein Papierpreis wird einmal geändert, die App rechnet alle betroffenen Artikel neu und erzeugt die Import-Dateien für den Shop. Dafür brauche ich drei Dinge, bitte als zusammenhängenden Designvorschlag:

### 1. Artikelverwaltung (neu)

Ein Admin-Bereich je Shop-Artikel innerhalb der Verwaltung. Hierarchie: **Gemeinsame Basis → Produkt (z. B. Rückstichheftung) → Artikel (z. B. „Rückstichheftung A4 Hoch 4/4 ohne Umschlag")**.

Jeder Artikel zeigt zwei klar getrennte Blöcke:

**A. Wirkt in der Kalkulation** (verändert die Preiszeilen, die exportiert werden; Werte werden von Basis/Produkt geerbt und können je Artikel überschrieben werden):
- Klickpreis 1c / 4c (Standard: aus Basis)
- Einrichtekosten (Standard: aus Basis)
- Weiterverarbeitungs-Tabelle (Standard: die Route-Tabelle des Produkts; Überschreibung z. B. als Prozent-Faktor oder als eigene Staffel)
- Umschlag-Zuschlag, Cello-Stückpreise (Standard: aus Basis)

Jedes Feld muss sichtbar machen, **ob der Wert geerbt oder überschrieben ist** (Badge „Basis"/„Produkt"/„Artikel") und einen Weg bieten, die Überschreibung wieder aufzuheben. Wer einen geerbten Wert ändert, soll nicht versehentlich alle Artikel treffen: Vorschlag für die Interaktion (z. B. Dialog „Nur dieser Artikel / Für alle Artikel des Produkts").

**B. Wirkt nur im Shop** (wird 1:1 in die Shop-Artikelfelder geschrieben, verändert die Preiszeilen nicht):
- Grundaufschlag in Prozent (heute 3 %; das ist der „PayPal-Aufschlag")
- Weiterverarbeitungs- und Service-Aufschläge (Festbeträge, Liste oben)
- Versand-Aufschläge
- Grundwerte (Mindestauflage, Mindestpreis, Produktionszeit, Gewicht …)
- Sichtbarkeit, Bezeichnung, Artikelnummer, Shop-Artikel-ID (nur lesend oder mit Warnung)

Wichtig: Die Preise im Rechner sind **ohne** Grundaufschlag; der Shop rechnet ihn obendrauf. Der Rechner sollte optional den „Shop-Preis inkl. Grundaufschlag" einblenden können, damit man sieht, was der Kunde zahlt.

Übersichtsseite „Artikel" je Produkt: Tabelle mit allen Artikeln (Bezeichnung, Artikelnummer, Shop-ID, sichtbar ja/nein, Anzahl Überschreibungen, Grundaufschlag, Stand des letzten Exports), Filter nach Format/Farbigkeit/Umschlag, Batch-Aktionen (z. B. Grundaufschlag für mehrere Artikel setzen).

### 2. Shop-Export / Ausrollen (neu)

Eine Seite, die aus dem **veröffentlichten** Stand die Import-Dateien erzeugt: Produkt wählen → Artikel anhaken → ZIP mit einer XLSX je Artikel herunterladen. Dazu je Artikel: Prüfstatus (Mapping vollständig? fehlende Shop-IDs? Warnungen), Anzahl Preiszeilen, wann zuletzt exportiert und mit welcher Revision. Realistischer Automatisierungsgrad: Die App erzeugt die Dateien, der Upload ins Shop-Backend bleibt ein manueller Schritt (es gibt keine Import-API). Das Design soll das ehrlich zeigen: „Erzeugt, noch nicht hochgeladen" vs. „Hochgeladen bestätigt" (manuelles Abhaken).

Außerdem ein **Preisvergleich vor dem Ausrollen**: Was ändert sich gegenüber dem letzten Export (Anzahl geänderter Zellen, größte Abweichung nach oben/unten, betroffene Artikel). Die App kennt bereits ein Diff-Muster mit den Tokens `diffUp`/`diffDown`.

### 3. Preisrechner-UI (Redesign-Vorschlag)

Der RST-Rechner soll neu gestaltet werden, die Logik bleibt. Anforderungen:
- Eingaben in einer Zeile/Leiste, Ergebnis sofort (keine Submit-Buttons), Tastatur-tauglich (Tab-Reihenfolge, Pfeiltasten bei Auflage/Seiten).
- Die Empfehlung (welche Route) muss sofort ins Auge fallen, die anderen Routen bleiben vergleichbar daneben (Gesamt, Stück, Produktionszeit, warum nicht empfohlen: z. B. „über Auflagenmaximum", „zu dick").
- Aufschlüsselung je Route aufklappbar: Papier, Klick, Weiterverarbeitung, Umschlag-Zuschlag, Dickenaufschlag, Einrichtekosten, Express, Makulaturbogen, Buchdicke.
- Hinweise/Fehler inline am Feld (z. B. „Seiten müssen durch 4 teilbar sein", „4 Seiten nur mit Umschlag", „Papier für dieses Format nicht freigegeben").
- Umschaltung „Shop-Preis inkl. Grundaufschlag" (siehe oben) und Anzeige, welcher Shop-Artikel diese Konfiguration abbildet (Bezeichnung + Link-Platzhalter).
- Staffelansicht: dieselbe Konfiguration für mehrere Auflagen nebeneinander (z. B. 1, 10, 50, 100, 250, 500, 1000) als Tabelle, exportierbar.
- Später kommen weitere Produkte (Flyer, Poster, Abschlussarbeiten): Das Layout soll als Muster für weitere Rechner taugen, Produktwahl oben links.

## Design-Vorgaben

- Bestehendes Token-System verwenden (CSS-Variablen, hell/dunkel): `--bg`, `--surface`, `--surface2`, `--text`, `--dim`, `--faint`, `--border`, `--brand` (#8e014d, Magenta-Bordeaux), `--good`, `--warn`, `--bad`, `--diff-up`, `--diff-down`. Keine neuen Markenfarben.
- Dichte Datenoberfläche für Fachanwender (Druckerei-Innendienst), kein Marketing-Look. Tabellen mit Zebra, kleine Schrift (12,5–14 px), klare Zahlenformate (deutsches Format: 1.234,56 €).
- Vorhandene Bausteine: TopBar mit Versionsanzeige, `PageHeader` mit Titel/Untertitel/Aktionen, `FieldCard` (Gruppe von Zahlenfeldern mit Einheit und Hinweis), `Chip` (Tab-Auswahl), `NumberField` (committet bei Blur/Enter).
- Verwaltung: Entwurf-/Veröffentlichen-Muster, Revisionsverlauf und Konfliktdialog existieren und sollen in die neue Struktur eingebettet werden, nicht ersetzt.
- Responsiv bis Tablet reicht; Hauptnutzung Desktop 1440 px.

## Bitte liefern

1. Informationsarchitektur: Navigation Dashboard → Verwaltung → Produkt → Artikel; wo Shop-Export sitzt; wie die Vererbung Basis → Produkt → Artikel sichtbar wird.
2. Screens (Desktop): Artikel-Übersicht, Artikel-Detail (Block A und B), Shop-Export mit Prüfstatus und Preisvergleich, RST-Rechner neu (Normalzustand, Fehlerzustand, Staffelansicht).
3. Komponenten-Spezifikation für die neuen Bausteine (Vererbungs-Badge, Override-Feld, Export-Statuszeile, Routen-Vergleichskarte, Staffeltabelle) mit Zuständen.
4. Offene Design-Fragen, die ich entscheiden muss, als kurze Liste.

Nicht gewünscht: Änderungen am PayPal-Export, neue Backend-Dienste, Änderungen an der Berechnungslogik.
