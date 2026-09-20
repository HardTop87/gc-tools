// Reine Logik des Rhaetia-Post-Managers: Porto, Länder, PLZ, Encoding,
// Spalten-Erkennung, Adress-Aufteilung und CSV-/Begleitlisten-Aufbau.
// Kein React, keine Browser-APIs — damit ist alles hier per Vitest prüfbar
// (siehe postVersand.test.js). Die Seite PostVersand.jsx importiert von hier.

export const SENDER_ROW = "K.B.St.V. Rhaetia;Herold-Schriftleitung;Luisenstr.;27;80333;München;DEU;HOUSE";
export const SENDER_NAME = SENDER_ROW.split(';')[0];

// Als Datenbank dient meist eine frühere Rhaetia-CSV — deren erste Datenzeile
// ist der Absender selbst. Der darf kein Match-Kandidat für Empfänger sein.
export const stripSenderRows = (rows) =>
    rows.filter((row) => String(row?.NAME ?? '').trim() !== SENDER_NAME);

export const INITIAL_WEIGHTS = { 
    heroldNetto: 170, heroldBrutto: 200, 
    programmNetto: 15, programmBrutto: 18 
};

// Porto Deutsche Post seit 01.01.2025 (Kompaktbrief Inland 1,00 → 1,10 EUR).
// Die Summe ist informativ; sie geht nicht in die Rhaetia-CSV ein.
export const RATES = {
    de: { standard: 0.95, kompakt: 1.10, gross: 1.80, maxi: 2.90, paket: 5.49 },
    intl: { standard: 1.25, kompakt: 1.80, gross: 3.30, maxi: 6.50, paket: 15.99 }
};


export const isLetterPostLabel = (label) => !/paket/i.test(String(label || ''));
export const isNoShippingRecord = (record) => record?.label === 'Kein Versand' || Boolean(record?.errorMsg);

export const WINDOWS_1252_SPECIAL = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
};

export const encodeWindows1252 = (text) => {
    const bytes = [];
    for (const ch of String(text || '')) {
        const cp = ch.codePointAt(0);
        if (cp <= 0xFF) {
            bytes.push(cp);
            continue;
        }
        if (WINDOWS_1252_SPECIAL[cp] !== undefined) {
            bytes.push(WINDOWS_1252_SPECIAL[cp]);
            continue;
        }
        bytes.push(0x3F); // '?' fallback for unsupported characters
    }
    return new Uint8Array(bytes);
};

export const toCsvCell = (value) => {
    const raw = String(value ?? '').trim();
    const emptyNormalized = raw === '-' ? '' : raw;
    return emptyNormalized
        .replace(/"/g, '')
        .replace(/[;\r\n]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
};

// F1/F2: Der Rhaetia-Export verändert manche Adressen zwangsläufig — Zeichen
// außerhalb von Windows-1252 (ł, ř, ş, ğ …) werden zu '?', Anführungszeichen
// entfernt, Semikolon/Zeilenumbruch durch Leerzeichen ersetzt. Diese Prüfung
// erkennt betroffene Datensätze, damit der Anwender es VOR dem Versand erfährt.
export const EXPORT_FIELDS = ['name', 'zusatz', 'strasse', 'nummer', 'plz', 'ort', 'landCode', 'type'];

export const hasUnsupportedWin1252 = (text) => {
    for (const ch of String(text || '')) {
        const cp = ch.codePointAt(0);
        if (cp > 0xFF && WINDOWS_1252_SPECIAL[cp] === undefined) return true;
    }
    return false;
};

export const getExportAenderungen = (record) => {
    let ersetzt = false;   // '?' statt nicht darstellbarer Zeichen (F1)
    let bereinigt = false; // von toCsvCell entfernte/ersetzte Zeichen (F2)
    for (const field of EXPORT_FIELDS) {
        const value = String(record?.[field] ?? '');
        if (hasUnsupportedWin1252(value)) ersetzt = true;
        if (/[";\r\n]/.test(value)) bereinigt = true;
    }
    return { ersetzt, bereinigt };
};

// B8: Download über eine kurzlebige Object-URL, die nach dem Klick wieder
// freigegeben wird; mehrere Downloads werden gestaffelt statt gleichzeitig
// gefeuert, damit der Browser sie nicht bündelt oder blockiert.
// Länder-Normalisierung auf ISO-3 (Rhaetia-Format). Unbekannte Werte bleiben
// unverändert, damit nichts still verloren geht — sie fallen in der Vorschau auf.
export const COUNTRY_CODE_MAP = {
    DE: 'DEU', D: 'DEU', DEU: 'DEU', DEUTSCHLAND: 'DEU', GERMANY: 'DEU',
    AT: 'AUT', A: 'AUT', AUT: 'AUT', OESTERREICH: 'AUT', ÖSTERREICH: 'AUT', AUSTRIA: 'AUT',
    CH: 'CHE', CHE: 'CHE', SCHWEIZ: 'CHE', SWITZERLAND: 'CHE',
    IT: 'ITA', ITA: 'ITA', ITALIEN: 'ITA', ITALY: 'ITA',
    NL: 'NLD', NLD: 'NLD', NIEDERLANDE: 'NLD', NETHERLANDS: 'NLD', HOLLAND: 'NLD',
    BE: 'BEL', BEL: 'BEL', BELGIEN: 'BEL', BELGIUM: 'BEL',
    LU: 'LUX', LUX: 'LUX', LUXEMBURG: 'LUX', LUXEMBOURG: 'LUX',
    FR: 'FRA', FRA: 'FRA', FRANKREICH: 'FRA', FRANCE: 'FRA',
    ES: 'ESP', ESP: 'ESP', SPANIEN: 'ESP', SPAIN: 'ESP',
    PT: 'PRT', PRT: 'PRT', PORTUGAL: 'PRT',
    GB: 'GBR', UK: 'GBR', GBR: 'GBR', GROSSBRITANNIEN: 'GBR', GROßBRITANNIEN: 'GBR',
    'VEREINIGTES KÖNIGREICH': 'GBR', 'UNITED KINGDOM': 'GBR', ENGLAND: 'GBR',
    IE: 'IRL', IRL: 'IRL', IRLAND: 'IRL', IRELAND: 'IRL',
    DK: 'DNK', DNK: 'DNK', DÄNEMARK: 'DNK', DAENEMARK: 'DNK', DENMARK: 'DNK',
    SE: 'SWE', SWE: 'SWE', SCHWEDEN: 'SWE', SWEDEN: 'SWE',
    NO: 'NOR', NOR: 'NOR', NORWEGEN: 'NOR', NORWAY: 'NOR',
    FI: 'FIN', FIN: 'FIN', FINNLAND: 'FIN', FINLAND: 'FIN',
    PL: 'POL', POL: 'POL', POLEN: 'POL', POLAND: 'POL',
    CZ: 'CZE', CZE: 'CZE', TSCHECHIEN: 'CZE', 'CZECH REPUBLIC': 'CZE', CZECHIA: 'CZE',
    SK: 'SVK', SVK: 'SVK', SLOWAKEI: 'SVK', SLOVAKIA: 'SVK',
    HU: 'HUN', HUN: 'HUN', UNGARN: 'HUN', HUNGARY: 'HUN',
    SI: 'SVN', SVN: 'SVN', SLOWENIEN: 'SVN', SLOVENIA: 'SVN',
    HR: 'HRV', HRV: 'HRV', KROATIEN: 'HRV', CROATIA: 'HRV',
    GR: 'GRC', GRC: 'GRC', GRIECHENLAND: 'GRC', GREECE: 'GRC',
    LI: 'LIE', LIE: 'LIE', LIECHTENSTEIN: 'LIE',
    VA: 'VAT', VAT: 'VAT', VATIKAN: 'VAT', VATIKANSTADT: 'VAT',
    TR: 'TUR', TUR: 'TUR', TÜRKEI: 'TUR', TUERKEI: 'TUR', TURKEY: 'TUR',
    US: 'USA', USA: 'USA', 'VEREINIGTE STAATEN': 'USA', 'UNITED STATES': 'USA',
    CA: 'CAN', CAN: 'CAN', KANADA: 'CAN', CANADA: 'CAN',
    AU: 'AUS', AUS: 'AUS', AUSTRALIEN: 'AUS', AUSTRALIA: 'AUS',
    JP: 'JPN', JPN: 'JPN', JAPAN: 'JPN',
    IL: 'ISR', ISR: 'ISR', ISRAEL: 'ISR',
};
export const KNOWN_ISO3 = new Set(Object.values(COUNTRY_CODE_MAP));

export const normalizeCountryCode = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    return COUNTRY_CODE_MAP[raw] || raw;
};

// Nur deutsche PLZ werden auf 5 Stellen aufgefüllt (Excel frisst führende
// Nullen: 01067 Dresden kommt als 1067 an). Vorher griff das auch für
// „NIEDERLANDE" oder „SCHWEDEN", weil dort „DE" im Namen steckt.
export const formatPLZ = (plz, land) => {
    const p = String(plz ?? '').trim();
    const l = normalizeCountryCode(land) || 'DEU';
    if (l === 'DEU' && p.length > 0 && p.length < 5 && /^\d+$/.test(p)) {
        return p.padStart(5, '0');
    }
    return p;
};

// --- HILFSFUNKTIONEN FÜR DATENBANK-ABGLEICH ---
// Zellwert als getrimmter String (Excel liefert Zahlen für PLZ/Hausnummer).
export const cellStr = (value) => (value === null || value === undefined ? '' : String(value).trim());

// Feldwerte ohne undefined/null/'' zu einem Text verbinden.
export const joinParts = (...parts) =>
    parts
        .map((p) => (p === null || p === undefined ? '' : String(p).trim()))
        .filter(Boolean)
        .join(' ');

export const cleanForMatch = (str) => {
    if (!str) return "";
    return String(str)
        .toLowerCase()
        .replace(/an die|an das|z\.hd\.|herr|frau|dr\.|prof\.|dipl\.|-bibliothek/g, "")
        .replace(/[^a-z0-9äöüß]/g, "") 
        .trim();
};

export const extractNumbers = (str) => {
    if (!str) return "";
    const matches = String(str).match(/\d+/g);
    return matches ? matches.join("") : "";
};

export const tokenizeName = (str) => {
    if (!str) return [];
    return String(str)
        .toLowerCase()
        .replace(/an die|an das|z\.hd\.|herr|frau|dr\.|prof\.|dipl\.|dipl-ing|ing\.|-bibliothek/g, ' ')
        .replace(/[^a-z0-9äöüß\s-]/g, ' ')
        .split(/[\s-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
};

export const normalizeStreet = (str) => {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/straße/g, 'str')
        .replace(/str\./g, 'str')
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9äöüß\s]/g, '')
        .trim();
};

export const splitStreetAndNumber = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return { street: '', number: '' };

    // Hausnummer am Ende: „27", „4a", „3-5", „10/12", „5 a". Vorher scheiterte
    // der Ausdruck an Ziffern nach Bindestrich oder Schrägstrich („3-5").
    const match = raw.match(/^(.*?)(\s+\d+[a-zA-Z0-9/-]*(?:\s[a-zA-Z])?\s*)$/);
    if (!match) {
        return { street: raw, number: '' };
    }

    return {
        // Nur Komma/Semikolon am Ende weg; der Punkt in „Luisenstr." bleibt.
        street: String(match[1] || '').trim().replace(/[,;]$/, ''),
        number: String(match[2] || '').trim(),
    };
};

export const normalizeSearchText = (value) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const isStrictCountryCode = (code) => KNOWN_ISO3.has(code);

export const looksLikeMojibake = (text) => /Ã.|â.|Â.|�/.test(text);

export const normalizeText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return value;

    let text = value.replace(/^\uFEFF/, '').trim();

    if (looksLikeMojibake(text)) {
        try {
            const repaired = decodeURIComponent(escape(text));
            if (repaired) text = repaired;
        } catch {
            // Fallback: keep original text when repair is not possible.
        }
    }

    return text;
};

export const normalizeRow = (row) => {
    const normalized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
        const cleanKey = String(normalizeText(key) || '').trim();
        if (!cleanKey) return;
        normalized[cleanKey] = normalizeText(value);
    });
    return normalized;
};

// Spalten der Quelldatei automatisch zuordnen. Eine Liste für CSV und Excel —
// vorher gab es zwei Kopien, und die Excel-Variante kannte „Strasse" ohne ß nicht.
export const MAPPING_HINTS = {
    anrede: ['anrede'], titel: ['titel'], akad: ['akademischer'],
    vorname: ['vorname'], nachname: ['nachname'], zusatz: ['zusatz'],
    strasse: ['straße', 'strasse', 'str.', 'adresse'], plz: ['plz', 'postleitzahl'],
    ort: ['ort', 'stadt'], land: ['land'],
    herold: ['herold'], programm: ['programm'],
};

export const autoDetectMapping = (headers) => {
    const lower = headers.map((h) => String(h).toLowerCase());
    const findCol = (keys) => {
        // Exakter Treffer zuerst („Land" vor „Bundesland"), dann Teilstring.
        const exactIdx = lower.findIndex((h) => keys.includes(h));
        if (exactIdx !== -1) return headers[exactIdx];
        const idx = lower.findIndex((h) => keys.some((k) => h.includes(k)));
        return idx !== -1 ? headers[idx] : '';
    };
    return Object.fromEntries(Object.entries(MAPPING_HINTS).map(([key, hints]) => [key, findCol(hints)]));
};

// --- PORTO UND ADRESSFELDER ---
export const getVersandArt = (gewicht, landCode) => {
    const normalizedLand = normalizeCountryCode(landCode || 'DEU') || 'DEU';
    const isDE = normalizedLand === 'DEU' || normalizedLand === 'DE';
    const rates = isDE ? RATES.de : RATES.intl;
    const prefix = isDE ? "" : "Int. ";

    if (gewicht <= 20) return { label: prefix + 'Standardbrief', price: rates.standard };
    if (gewicht <= 50) return { label: prefix + 'Kompaktbrief', price: rates.kompakt };
    if (gewicht <= 500) return { label: prefix + 'Großbrief', price: rates.gross };
    if (gewicht <= 1000) return { label: prefix + 'Maxibrief', price: rates.maxi };
    return { label: prefix + 'Paket', price: rates.paket, isDHL: true };
};

export const parsePlzAndLand = (value, fallbackLand = 'DEU') => {
    const raw = String(value || '').trim();
    if (!raw) return { plz: '', land: normalizeCountryCode(fallbackLand) || 'DEU' };

    const parts = raw.split(/\s+/);
    const maybeLand = normalizeCountryCode(parts[parts.length - 1]);
    if (parts.length > 1 && maybeLand && maybeLand.length === 3) {
        return {
            plz: parts.slice(0, -1).join(' ').trim(),
            land: maybeLand,
        };
    }

    return { plz: raw, land: normalizeCountryCode(fallbackLand) || 'DEU' };
};

// Straße/Hausnummer/Typ für den Export bestimmen. Unbearbeitete Quellzeilen
// haben die Hausnummer noch im Straßenfeld („Luisenstr. 27") — vorher wurde
// sie nur getrennt, wenn der Anwender die Zeile im Editor geöffnet hatte.
export const resolveAddressFields = (item) => {
    const strasse = cellStr(item.strasse);
    const nummer = cellStr(item.nummer);
    if (nummer || !strasse) return { strasse, nummer, type: item.type || 'HOUSE' };

    const postfach = strasse.match(/^postfach\s*(.*)$/i);
    if (postfach) return { strasse: 'Postfach', nummer: postfach[1].trim(), type: 'POBOX' };

    const split = splitStreetAndNumber(strasse);
    return { strasse: split.street, nummer: split.number, type: item.type || 'HOUSE' };
};

// --- EXPORT: RHAETIA-CSV UND BEGLEITLISTE ---
export const RHAETIA_CSV_HEADER = 'NAME;ZUSATZ;STRASSE;NUMMER;PLZ;STADT;LAND;ADRESS_TYP';

// Eine Etikettenseite bei Rhaetia hat 12 Etiketten; der Absender (Zeile 1 der
// CSV) zählt in der Begleitliste bewusst NICHT mit — Index 0 im Batch ist Pos. 1.
export const LABELS_PER_PAGE = 12;

export const csvRowForRecord = (r) => [
    r.name, r.zusatz, r.strasse, r.nummer,
    formatPLZ(r.plz, r.landCode), r.ort, r.landCode, r.type || 'HOUSE',
].map(toCsvCell).join(';');

// Ungequotetes Semikolon-CSV mit CRLF, Absender als erste Datenzeile.
export const buildRhaetiaCsv = (records) =>
    [RHAETIA_CSV_HEADER, SENDER_ROW, ...records.map(csvRowForRecord)].join('\r\n') + '\r\n';

export const labelPosition = (labelIndex) => ({
    page: Math.floor((labelIndex - 1) / LABELS_PER_PAGE) + 1,
    pos: ((labelIndex - 1) % LABELS_PER_PAGE) + 1,
});

// Begleitliste nur für Mehrfachempfänger; null, wenn es keine gibt.
export const buildBegleitliste = (title, records) => {
    const multi = records
        .map((r, idx) => ({ ...r, labelIndex: idx + 1 }))
        .filter((r) => r.hQty > 1 || r.pQty > 1);
    if (multi.length === 0) return null;
    const lines = multi.map((r) => {
        const { page, pos } = labelPosition(r.labelIndex);
        return `S. ${page}, Pos. ${pos} | ${r.name} | ${r.plz} ${r.ort} | ${r.hQty}x Herold, ${r.pQty}x Prog | ${r.totalWeight}g`;
    });
    return [`BEGLEITLISTE - ${title}`, '', ...lines].join('\r\n') + '\r\n';
};

// Mehrfachempfänger nach oben, dann in Teillisten von `limit` Adressen.
export const splitIntoBatches = (records, limit = 99) => {
    const sorted = [...records].sort((a, b) => ((b.hQty || 0) + (b.pQty || 0)) - ((a.hQty || 0) + (a.pQty || 0)));
    const batches = [];
    for (let i = 0; i < sorted.length; i += limit) batches.push(sorted.slice(i, i + limit));
    return batches;
};
