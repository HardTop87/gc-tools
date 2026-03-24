import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeft, Download, UploadCloud, AlertTriangle,
    Search, XCircle, FileText, Package, Truck, Zap,
    Database, CheckCircle, Clock, Loader2, ListFilter,
    Unlink, CheckSquare, Info, ArrowUp, ChevronLeft, ChevronRight, Lock, Unlock
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// --- KONFIGURATION ---
const SENDER_ROW = "K.B.St.V. Rhaetia;Herold-Schriftleitung;Luisenstr.;27;80333;München;DEU;HOUSE";

const INITIAL_WEIGHTS = { 
    heroldNetto: 170, heroldBrutto: 200, 
    programmNetto: 15, programmBrutto: 18 
};

const RATES = {
    de: { standard: 0.95, kompakt: 1.00, gross: 1.80, maxi: 2.90, paket: 5.49 },
    intl: { standard: 1.25, kompakt: 1.80, gross: 3.30, maxi: 6.50, paket: 15.99 }
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const formatETA = (ms) => {
    if (!ms || ms < 0) return "Berechne...";
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m} Min. ${s} Sek.`;
};

const isLetterPostLabel = (label) => !/paket/i.test(String(label || ''));
const isNoShippingRecord = (record) => record?.label === 'Kein Versand' || Boolean(record?.errorMsg);

const WINDOWS_1252_SPECIAL = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
};

const encodeWindows1252 = (text) => {
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

const toCsvCell = (value) => {
    const raw = String(value ?? '').trim();
    const emptyNormalized = raw === '-' ? '' : raw;
    return emptyNormalized
        .replace(/"/g, '')
        .replace(/[;\r\n]+/g, ' ')
        .trim();
};

const formatPLZ = (plz, land) => {
    let p = String(plz || '').trim();
    const l = String(land || 'DEU').toUpperCase();
    if ((l.includes('DE') || l === '') && p.length > 0 && p.length < 5) {
        return p.padStart(5, '0');
    }
    return p;
};

const normalizeCountryCode = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';

    const map = {
        DE: 'DEU',
        D: 'DEU',
        DEU: 'DEU',
        DEUTSCHLAND: 'DEU',
        GERMANY: 'DEU',
        AT: 'AUT',
        AUT: 'AUT',
        A: 'AUT',
        OESTERREICH: 'AUT',
        ÖSTERREICH: 'AUT',
        AUSTRIA: 'AUT',
        CH: 'CHE',
        CHE: 'CHE',
        SCHWEIZ: 'CHE',
        SWITZERLAND: 'CHE',
        IT: 'ITA',
        ITA: 'ITA',
        ITALIEN: 'ITA',
        ITALY: 'ITA',
    };

    return map[raw] || raw;
};

// --- HILFSFUNKTIONEN FÜR DATENBANK-ABGLEICH ---
const cleanForMatch = (str) => {
    if (!str) return "";
    return String(str)
        .toLowerCase()
        .replace(/an die|an das|z\.hd\.|herr|frau|dr\.|prof\.|dipl\.|-bibliothek/g, "")
        .replace(/[^a-z0-9äöüß]/g, "") 
        .trim();
};

const extractNumbers = (str) => {
    if (!str) return "";
    const matches = String(str).match(/\d+/g);
    return matches ? matches.join("") : "";
};

const tokenizeName = (str) => {
    if (!str) return [];
    return String(str)
        .toLowerCase()
        .replace(/an die|an das|z\.hd\.|herr|frau|dr\.|prof\.|dipl\.|dipl\-ing|ing\.|-bibliothek/g, ' ')
        .replace(/[^a-z0-9äöüß\s-]/g, ' ')
        .split(/[\s-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
};

const normalizeStreet = (str) => {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/straße/g, 'str')
        .replace(/str\./g, 'str')
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9äöüß\s]/g, '')
        .trim();
};

const splitStreetAndNumber = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return { street: '', number: '' };

    const match = raw.match(/^(.*?)(\s+\d+[a-zA-Z\/-]*\s*)$/);
    if (!match) {
        return { street: raw, number: '' };
    }

    return {
        street: String(match[1] || '').trim().replace(/[.,;]$/, ''),
        number: String(match[2] || '').trim(),
    };
};

const normalizeSearchText = (value) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isStrictCountryCode = (code) => ['DEU', 'AUT', 'CHE', 'ITA'].includes(code);

const looksLikeMojibake = (text) => /Ã.|â.|Â.|�/.test(text);

const normalizeText = (value) => {
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

const normalizeRow = (row) => {
    const normalized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
        const cleanKey = String(normalizeText(key) || '').trim();
        if (!cleanKey) return;
        normalized[cleanKey] = normalizeText(value);
    });
    return normalized;
};

const parseCsvFile = (file, onComplete, onError) => {
    const reader = new FileReader();

    reader.onload = (evt) => {
        try {
            const buffer = evt.target.result;
            const decode = (encoding) => new TextDecoder(encoding, { fatal: false }).decode(buffer);

            const parseCsvText = (text) =>
                Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                    delimitersToGuess: [';', ',', '\t'],
                });

            const utf8Result = parseCsvText(decode('utf-8'));
            const utf8Rows = utf8Result.data || [];
            const utf8HasMojibake = utf8Rows.some((row) =>
                Object.values(row || {}).some(
                    (cell) => typeof cell === 'string' && looksLikeMojibake(cell),
                ),
            );

            let finalRows = utf8Rows;
            let encodingUsed = 'UTF-8';

            if (utf8HasMojibake) {
                const cpResult = parseCsvText(decode('windows-1252'));
                const cpRows = cpResult.data || [];

                if (cpRows.length > 0) {
                    finalRows = cpRows;
                    encodingUsed = 'Windows-1252';
                }
            }

            onComplete(finalRows.map(normalizeRow), { encodingUsed });
        } catch (error) {
            onError(error);
        }
    };

    reader.onerror = onError;
    reader.readAsArrayBuffer(file);
};

export default function PostVersandManager() {
    const [apiKey, setApiKey] = useState(import.meta.env.VITE_GROQ_API_KEY || '');
    const [selectedProvider, setSelectedProvider] = useState('groq');
    const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
    const [ollamaModel, setOllamaModel] = useState('qwen2.5-coder:14b');
    const [weights, setWeights] = useState(INITIAL_WEIGHTS);
    
    const [rawData, setRawData] = useState([]);
    const [dbData, setDbData] = useState([]); 
    const [headers, setHeaders] = useState([]);
    const [mapping, setMapping] = useState({});
    
    const [preMatchResults, setPreMatchResults] = useState(null); 
    const [activeTab, setActiveTab] = useState('matched'); 
    
    // States für Modals & Editing
    const [matchModalOpen, setMatchModalOpen] = useState(false);
    const [currentItemToMatch, setCurrentItemToMatch] = useState(null);
    const [manualSearchQuery, setManualSearchQuery] = useState('');
    const [editorFormData, setEditorFormData] = useState({
        name: '',
        zusatz: '',
        strasse: '',
        nummer: '',
        plz: '',
        stadt: '',
        land: 'DEU',
        adressTyp: 'HOUSE',
    });

    const [results, setResults] = useState(null);
    const [view, setView] = useState('upload'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [procStats, setProcStats] = useState({ ai: 0, db: 0, total: 0, eta: 0, progress: 0 });
    const [uploadEncoding, setUploadEncoding] = useState({ source: '', db: '' });
    const [showOnlyMismatches, setShowOnlyMismatches] = useState(false);
    const [expandedMatchRows, setExpandedMatchRows] = useState({});

    const handleSourceUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name.toLowerCase().endsWith('.csv')) {
            parseCsvFile(
                file,
                (rows, meta) => {
                    const currentHeaders = Object.keys(rows[0] || {});
                    if (!currentHeaders.length) {
                        alert('CSV enthält keine verwertbaren Spalten.');
                        return;
                    }

                    setUploadEncoding((prev) => ({ ...prev, source: `CSV: ${meta?.encodingUsed || 'UTF-8'}` }));

                    setHeaders(currentHeaders);
                    setRawData(rows);

                    const findCol = (keys) =>
                        currentHeaders.find((h) =>
                            keys.some((k) => String(h).toLowerCase().includes(k)),
                        ) || '';

                    setMapping({
                        anrede: findCol(['anrede']), titel: findCol(['titel']), 
                        akad: findCol(['akademischer']), vorname: findCol(['vorname']), 
                        nachname: findCol(['nachname']), zusatz: findCol(['zusatz']),
                        strasse: findCol(['straße', 'strasse', 'adresse']), plz: findCol(['plz']), 
                        ort: findCol(['ort', 'stadt']), land: findCol(['land']), 
                        herold: findCol(['herold']), programm: findCol(['programm'])
                    });
                },
                () => {
                    setUploadEncoding((prev) => ({ ...prev, source: 'CSV: Fehler beim Lesen' }));
                    alert('CSV konnte nicht gelesen werden.');
                },
            );
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target.result, { type: 'array' });
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            
            const hIdx = data.findIndex(r => r && r.some(c => String(c||'').toLowerCase().includes('nachname')));
            if (hIdx === -1) return alert("Konnte Kopfzeile nicht finden!");
            
            const currentHeaders = data[hIdx].map(h => String(h || '').trim());
            setHeaders(currentHeaders);
            setRawData(
                XLSX.utils
                    .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { range: hIdx })
                    .map(normalizeRow),
            );
            setUploadEncoding((prev) => ({ ...prev, source: 'Excel: XLS/XLSX' }));
            
            const findCol = (keys) => currentHeaders.find(h => keys.some(k => String(h).toLowerCase().includes(k))) || '';
            setMapping({
                anrede: findCol(['anrede']), titel: findCol(['titel']), 
                akad: findCol(['akademischer']), vorname: findCol(['vorname']), 
                nachname: findCol(['nachname']), zusatz: findCol(['zusatz']),
                strasse: findCol(['straße', 'adresse']), plz: findCol(['plz']), 
                ort: findCol(['ort', 'stadt']), land: findCol(['land']), 
                herold: findCol(['herold']), programm: findCol(['programm'])
            });
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDbUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name.toLowerCase().endsWith('.csv')) {
            parseCsvFile(
                file,
                (rows, meta) => {
                    setDbData(rows);
                    setUploadEncoding((prev) => ({ ...prev, db: `CSV: ${meta?.encodingUsed || 'UTF-8'}` }));
                },
                () => {
                    setUploadEncoding((prev) => ({ ...prev, db: 'CSV: Fehler beim Lesen' }));
                    alert('Datenbank-CSV konnte nicht gelesen werden.');
                },
            );
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target.result, { type: 'array' });
            setDbData(
                XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]).map(normalizeRow),
            );
            setUploadEncoding((prev) => ({ ...prev, db: 'Excel: XLS/XLSX' }));
        };
        reader.readAsArrayBuffer(file);
    };

    const getVersandArt = (gewicht, landCode) => {
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

    const findInDatabase = (rawRow) => {
        if (!dbData || dbData.length === 0) return { match: null, reason: 'Keine Datenbank geladen' };
        const rawLand = normalizeCountryCode(rawRow.land || 'DEU');
        const rawPlz = formatPLZ(rawRow.plz, rawLand);
        const sourceCloud = cleanForMatch(`${rawRow.anrede} ${rawRow.titel} ${rawRow.vorname} ${rawRow.nachname} ${rawRow.zusatz}`);
        const sourceNumbers = extractNumbers(rawRow.strasse);
        const sourceStreet = normalizeStreet(rawRow.strasse);
        const sourceFirstName = cleanForMatch(rawRow.vorname);
        const sourceLastName = cleanForMatch(rawRow.nachname);
        const sourceTokens = tokenizeName(`${rawRow.anrede} ${rawRow.titel} ${rawRow.vorname} ${rawRow.nachname} ${rawRow.zusatz}`);
        const sourceIsPerson = /herr|frau/i.test(String(rawRow.anrede || '')) || String(rawRow.vorname || '').trim().length > 1;

        const candidates = dbData.map((dbRow) => {
            const dbLand = normalizeCountryCode(dbRow.LAND || dbRow.landCode || 'DEU');
            const dbPlz = formatPLZ(dbRow.PLZ || dbRow.plz, dbLand);
            if (dbPlz !== rawPlz) return null;
            if (isStrictCountryCode(rawLand) && isStrictCountryCode(dbLand) && dbLand !== rawLand) return null;

            const dbCombinedName = `${dbRow.NAME || ''} ${dbRow.ZUSATZ || ''}`.trim();
            const dbNameClean = cleanForMatch(dbCombinedName);
            const dbNameTokens = tokenizeName(dbCombinedName);
            const dbNumbers = extractNumbers(`${dbRow.STRASSE} ${dbRow.NUMMER}`);
            const dbStreet = normalizeStreet(dbRow.STRASSE);
            let score = 0;

            if (sourceStreet && dbStreet) {
                if (sourceStreet.includes(dbStreet) || dbStreet.includes(sourceStreet)) score += 20;
                else score -= 20;
            } else {
                score += 8;
            }

            if (sourceNumbers && dbNumbers) {
                if (dbNumbers === sourceNumbers) score += 20;
                else if (dbNumbers.includes(sourceNumbers) || sourceNumbers.includes(dbNumbers)) score += 10;
                else score -= 20;
            }

            if (sourceIsPerson && sourceLastName && sourceLastName.length >= 3) {
                if (dbNameClean.includes(sourceLastName)) score += 35;
                else return null;
            }

            if (sourceIsPerson && sourceFirstName && sourceFirstName.length >= 3) {
                if (dbNameClean.includes(sourceFirstName)) score += 15;
                else if (dbNameTokens.some((t) => t.startsWith(sourceFirstName.slice(0, 3)))) score += 8;
                else score -= 8;
            }

            const tokenMatches = sourceTokens.filter((token) => dbNameTokens.includes(token)).length;
            const tokenRatio = sourceTokens.length > 0 ? tokenMatches / sourceTokens.length : 0;
            score += Math.round(tokenRatio * 20);

            if (sourceCloud && dbNameClean && (sourceCloud.includes(dbNameClean) || dbNameClean.includes(sourceCloud))) {
                score += 20;
            }

            if (!sourceLastName && tokenRatio < 0.25) {
                score -= 12;
            }

            return { dbRow, score };
        }).filter(Boolean);

        if (candidates.length === 0) return { match: null, reason: 'Keine Adresse mit gleicher PLZ/Land gefunden' };

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        const second = candidates[1];

        if (best.score < 25) {
            return { match: null, reason: `Treffer zu unsicher (Score ${best.score})` };
        }

        if (second && second.score >= best.score - 4 && best.score < 55) {
            return { match: null, reason: `Mehrdeutiger Treffer (${best.score} vs ${second.score})` };
        }

        return { match: best.dbRow, reason: `Auto-Match (Score ${best.score})` };
    };

    const prepareDbMatch = () => {
        if (selectedProvider !== 'ollama' && !apiKey && dbData.length === 0) return alert("Ohne API Key musst du zumindest eine Datenbank hochladen!");
        const matchedList = []; const unmatchedList = [];

        rawData.forEach((row, index) => {
            const hQty = parseInt(row[mapping.herold]) || 0;
            const pQty = parseInt(row[mapping.programm]) || 0;
            let weight = 0;
            if (hQty > 0) weight = weights.heroldBrutto + ((hQty - 1) * weights.heroldNetto) + (pQty * weights.programmNetto);
            else if (pQty > 0) weight = weights.programmBrutto + ((pQty - 1) * weights.programmNetto);

            const mini = { 
                id: index, anrede: row[mapping.anrede], titel: row[mapping.titel], akad: row[mapping.akad], 
                vorname: row[mapping.vorname], nachname: row[mapping.nachname], zusatz: row[mapping.zusatz], 
                strasse: row[mapping.strasse], plz: row[mapping.plz], ort: row[mapping.ort], land: row[mapping.land], 
                hQty, pQty, totalWeight: weight, originalRow: row 
            };

            if (hQty === 0 && pQty === 0) {
                matchedList.push({ ...mini, name: `${row[mapping.anrede]||''} ${row[mapping.nachname]||''}`.trim(), label: 'Kein Versand', price: 0, errorMsg: "Kein Versand (0 Stk)", fromDB: false });
                return;
            }

            const dbDecision = findInDatabase(mini);
            const cached = dbDecision.match;
            if (cached) {
                const normalizedLand = normalizeCountryCode(cached.LAND || cached.landCode || 'DEU') || 'DEU';
                const ship = getVersandArt(weight, normalizedLand);
                matchedList.push({ ...mini, name: cached.NAME, zusatz: cached.ZUSATZ, strasse: cached.STRASSE, nummer: cached.NUMMER, plz: cached.PLZ, ort: cached.STADT || cached.ORT, landCode: normalizedLand, type: cached.ADRESS_TYP || 'HOUSE', label: ship.label, price: ship.price, isDHL: ship.isDHL, fromDB: true });
            } else {
                unmatchedList.push({ ...mini, matchHint: dbDecision.reason || 'Kein eindeutiger Datenbank-Treffer', isFrozen: false });
            }
        });

        setPreMatchResults({ matchedList, unmatchedList });
        setActiveTab(matchedList.length > 0 ? 'matched' : 'unmatched');
        setView('db-preview');
    };

    const unmatchItem = (id) => {
        setPreMatchResults(prev => {
            const itemToUnmatch = prev.matchedList.find(m => m.id === id);
            const newMatched = prev.matchedList.filter(m => m.id !== id);
            const resetItem = {
                id: itemToUnmatch.id, anrede: itemToUnmatch.anrede, titel: itemToUnmatch.titel, 
                akad: itemToUnmatch.akad, vorname: itemToUnmatch.vorname, nachname: itemToUnmatch.nachname, 
                zusatz: itemToUnmatch.zusatz, strasse: itemToUnmatch.originalRow[mapping.strasse], 
                plz: itemToUnmatch.originalRow[mapping.plz], ort: itemToUnmatch.originalRow[mapping.ort], 
                land: itemToUnmatch.originalRow[mapping.land], hQty: itemToUnmatch.hQty, pQty: itemToUnmatch.pQty, 
                totalWeight: itemToUnmatch.totalWeight, originalRow: itemToUnmatch.originalRow,
                matchHint: 'Manuell getrennt',
                isFrozen: false,
            };
            return { matchedList: newMatched, unmatchedList: [...prev.unmatchedList, resetItem] };
        });
    };

    const parsePlzAndLand = (value, fallbackLand = 'DEU') => {
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

    const buildPlzInput = (plz, land) => {
        const cleanPlz = String(plz || '').trim();
        if (!cleanPlz) return '';
        return cleanPlz;
    };

    const getSearchSeed = (item, fallbackName = '') => {
        const directLastName = String(item?.nachname || '').trim();
        const city = String(item?.ort || item?.stadt || '').trim();
        if (directLastName) return [directLastName, city].filter(Boolean).join(' ');

        const rawName = String(item?.name || fallbackName || '').trim();
        if (!rawName) return city;

        const tokens = rawName.split(/\s+/).filter(Boolean);
        const fallbackLastName = tokens[tokens.length - 1] || rawName;
        return [fallbackLastName, city].filter(Boolean).join(' ');
    };

    const toEditorForm = (item) => {
        const sourceName =
            item.name ||
            [item.anrede, item.titel, item.akad, item.vorname, item.nachname]
                .filter(Boolean)
                .join(' ')
                .trim();
        const parsed = parsePlzAndLand(item.plz, item.landCode || item.land || 'DEU');
        const splitAddress = splitStreetAndNumber(item.strasse || '');
        return {
            name: sourceName || '',
            zusatz: item.zusatz || '',
            strasse: splitAddress.street || item.strasse || '',
            nummer: item.nummer || splitAddress.number || '',
            plz: buildPlzInput(parsed.plz, parsed.land),
            stadt: item.ort || item.stadt || '',
            land: parsed.land,
            adressTyp: item.type || item.adressTyp || (/postfach/i.test(item.strasse || '') ? 'POBOX' : 'HOUSE'),
        };
    };

    const mergeEditorIntoItem = (item, form) => {
        const parsed = parsePlzAndLand(form.plz, form.land || item.landCode || item.land || 'DEU');
        const normalizedLand = normalizeCountryCode(form.land || parsed.land || 'DEU') || 'DEU';
        const normalizedPlz = formatPLZ(parsed.plz, normalizedLand);
        return {
            ...item,
            name: String(form.name || '').trim() || item.name || '',
            zusatz: String(form.zusatz || '').trim(),
            strasse: String(form.strasse || '').trim(),
            nummer: String(form.nummer || '').trim(),
            plz: normalizedPlz,
            ort: String(form.stadt || '').trim(),
            land: normalizedLand,
            landCode: normalizedLand,
            type: form.adressTyp || 'HOUSE',
            manualEdited: true,
        };
    };

    const openManualEditor = (startItem = null) => {
        const fallback = preMatchResults?.unmatchedList?.[0];
        const target = startItem || fallback;
        if (!target) return;
        setCurrentItemToMatch(target);
        const nextForm = toEditorForm(target);
        setEditorFormData(nextForm);
        setManualSearchQuery(getSearchSeed(target, nextForm.name));
        setMatchModalOpen(true);
    };

    const saveCurrentEditorItem = () => {
        if (!currentItemToMatch || currentItemToMatch.isFrozen) return;
        setPreMatchResults((prev) => ({
            ...prev,
            unmatchedList: prev.unmatchedList.map((item) =>
                item.id === currentItemToMatch.id ? mergeEditorIntoItem(item, editorFormData) : item,
            ),
        }));
    };

    const toggleFreezeCurrent = () => {
        if (!currentItemToMatch) return;
        setPreMatchResults((prev) => ({
            ...prev,
            unmatchedList: prev.unmatchedList.map((item) =>
                item.id === currentItemToMatch.id ? { ...item, isFrozen: !item.isFrozen } : item,
            ),
        }));
        setCurrentItemToMatch((prev) => (prev ? { ...prev, isFrozen: !prev.isFrozen } : prev));
    };

    const getFuzzySuggestions = (item) => {
        if (!item || dbData.length === 0) return [];
        const sourceCloud = cleanForMatch(`${item.name || ''} ${item.anrede || ''} ${item.titel || ''} ${item.vorname || ''} ${item.nachname || ''} ${item.zusatz || ''}`);
        const parsed = parsePlzAndLand(item.plz, item.landCode || item.land || 'DEU');
        const rawPlz = formatPLZ(parsed.plz, parsed.land);
        let scored = dbData.map(dbRow => {
            let score = 0;
            const dbPlz = formatPLZ(dbRow.PLZ || dbRow.plz, dbRow.LAND || dbRow.landCode);
            const dbNameClean = cleanForMatch(dbRow.NAME);
            if (dbPlz === rawPlz) score += 50;
            const sourceWords = sourceCloud.split(' ').filter(w=>w.length>2);
            let matches = 0;
            sourceWords.forEach(sw => { if (dbNameClean.includes(sw)) matches++; });
            score += (matches * 15);
            return { dbRow, score };
        });
        return scored.filter(s => s.score > 10).sort((a,b) => b.score - a.score).slice(0, 3);
    };

    const manualSearchResults = useMemo(() => {
        if (!manualSearchQuery || dbData.length === 0) return [];
        const tokens = normalizeSearchText(manualSearchQuery)
            .split(' ')
            .map((t) => t.trim())
            .filter(Boolean);
        if (tokens.length === 0) return [];

        const scored = dbData
            .map((dbRow) => {
                const name = String(dbRow.NAME || '');
                const city = String(dbRow.STADT || dbRow.ORT || '');
                const street = String(dbRow.STRASSE || '');
                const plz = String(dbRow.PLZ || '');
                const land = String(dbRow.LAND || dbRow.landCode || '');
                const haystack = normalizeSearchText(`${name} ${street} ${plz} ${city} ${land}`);

                if (!tokens.every((token) => haystack.includes(token))) {
                    return null;
                }

                // Prefer exact/name-city hits when multiple rows match all tokens.
                let score = 0;
                const nameNorm = normalizeSearchText(name);
                const cityNorm = normalizeSearchText(city);
                tokens.forEach((token) => {
                    if (nameNorm === token) score += 100;
                    else if (nameNorm.startsWith(token)) score += 40;
                    else if (nameNorm.includes(token)) score += 25;

                    if (cityNorm === token) score += 50;
                    else if (cityNorm.startsWith(token)) score += 20;
                    else if (cityNorm.includes(token)) score += 10;
                });

                return { dbRow, score };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map((entry) => entry.dbRow);

        return scored;
    }, [manualSearchQuery, dbData]);

    const modalUnmatchedList = preMatchResults?.unmatchedList || [];
    const modalItemIndex = useMemo(() => {
        if (!currentItemToMatch) return -1;
        return modalUnmatchedList.findIndex((item) => item.id === currentItemToMatch.id);
    }, [modalUnmatchedList, currentItemToMatch]);

    const navigateModalItem = (direction) => {
        if (!currentItemToMatch || modalUnmatchedList.length === 0 || modalItemIndex === -1) return;
        if (!currentItemToMatch.isFrozen) {
            saveCurrentEditorItem();
        }
        const targetIndex = modalItemIndex + direction;
        if (targetIndex < 0 || targetIndex >= modalUnmatchedList.length) return;
        const target = modalUnmatchedList[targetIndex];
        setCurrentItemToMatch(target);
        const nextForm = toEditorForm(target);
        setEditorFormData(nextForm);
        setManualSearchQuery(getSearchSeed(target, nextForm.name));
    };

    const applyDbResultToEditor = (dbRow) => {
        const dbLand = normalizeCountryCode(dbRow.LAND || dbRow.landCode || editorFormData.land || 'DEU') || 'DEU';
        setEditorFormData((prev) => ({
            ...prev,
            name: dbRow.NAME || prev.name,
            zusatz: dbRow.ZUSATZ || '',
            strasse: dbRow.STRASSE || '',
            nummer: dbRow.NUMMER || '',
            plz: String(dbRow.PLZ || '').trim(),
            stadt: dbRow.STADT || dbRow.ORT || '',
            land: dbLand,
            adressTyp: dbRow.ADRESS_TYP || 'HOUSE',
        }));
    };

    const buildGroupedSummary = (previewList) => {
        const groups = {};
        let totalCost = 0;

        previewList.forEach((rec) => {
            if (rec.excluded) return;
            if (rec.label === 'Kein Versand' || rec.errorMsg) return;

            let mix = '';
            if (rec.hQty > 0 && rec.pQty === 0) mix = 'nur Herold';
            else if (rec.hQty === 0 && rec.pQty > 0) mix = 'nur Semesterprogramm';
            else mix = 'Herold + Semesterprogramm';

            const groupKey = `${rec.label} (${mix})`;
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(rec);

            if (isLetterPostLabel(rec.label)) {
                totalCost += rec.price;
            }
        });

        return { groups, totalCost };
    };

    const finalizeManualToPreview = (matchedList, unmatchedList) => {
        const previewList = matchedList.map((item) => {
            if (isNoShippingRecord(item)) {
                return { ...item, excluded: true };
            }

            const normalizedLand = normalizeCountryCode(item.landCode || item.land || 'DEU') || 'DEU';
            const ship = getVersandArt(item.totalWeight, normalizedLand);
            return {
                ...item,
                landCode: normalizedLand,
                label: ship.label,
                price: ship.price,
                isDHL: ship.isDHL,
                excluded: false,
            };
        });
        unmatchedList.forEach((item) => {
            const parsed = parsePlzAndLand(item.plz, item.landCode || item.land || 'DEU');
            const landCode = normalizeCountryCode(item.landCode || item.land || parsed.land || 'DEU') || 'DEU';
            const ship = getVersandArt(item.totalWeight, landCode);
            previewList.push({
                ...item,
                name: item.name || [item.anrede, item.titel, item.akad, item.vorname, item.nachname].filter(Boolean).join(' ').trim() || 'Fehler: Name fehlt',
                zusatz: item.zusatz || '-',
                strasse: item.strasse || '',
                nummer: item.nummer || '',
                plz: formatPLZ(parsed.plz, landCode),
                ort: item.ort || '',
                landCode,
                type: item.type || 'HOUSE',
                label: ship.label,
                price: ship.price,
                isDHL: ship.isDHL,
                fromDB: false,
                excluded: isNoShippingRecord(item),
            });
        });

        return { preview: previewList, ...buildGroupedSummary(previewList) };
    };

    const togglePreviewExclusion = (id) => {
        setResults((prev) => {
            if (!prev) return prev;
            const updatedPreview = prev.preview.map((item) =>
                item.id === id
                    ? (isNoShippingRecord(item) ? item : { ...item, excluded: !item.excluded })
                    : item,
            );
            return { ...prev, preview: updatedPreview, ...buildGroupedSummary(updatedPreview) };
        });
    };


    const runAiProcessing = async () => {
        if (!preMatchResults) return;
        setIsProcessing(true);

        // KI-Flow bewusst deaktiviert: Verarbeitung erfolgt nur manuell im Editor.
        const prepared = finalizeManualToPreview(preMatchResults.matchedList, preMatchResults.unmatchedList);
        setProcStats({
            ai: preMatchResults.unmatchedList.length,
            db: preMatchResults.matchedList.filter((m) => m.fromDB).length,
            total: rawData.length,
            eta: 0,
            progress: 100,
        });
        setResults(prepared);
        setView('preview');
        setIsProcessing(false);
    };

    const finishManualEditing = () => {
        if (!preMatchResults) return;

        const mergedUnmatched = modalUnmatchedList.map((item) => {
            if (!currentItemToMatch) return item;
            if (item.id !== currentItemToMatch.id) return item;
            if (item.isFrozen) return item;
            return mergeEditorIntoItem(item, editorFormData);
        });

        setPreMatchResults((prev) => ({
            ...prev,
            unmatchedList: mergedUnmatched,
        }));

        const prepared = finalizeManualToPreview(preMatchResults.matchedList, mergedUnmatched);
        setProcStats({
            ai: mergedUnmatched.length,
            db: preMatchResults.matchedList.filter((m) => m.fromDB).length,
            total: rawData.length,
            eta: 0,
            progress: 100,
        });
        setResults(prepared);
        setMatchModalOpen(false);
        setView('preview');
    };

    const downloadCSV = (label, records) => {
        // SORTIEREN: Mehrfachempfänger nach ganz oben
        const sorted = [...records].sort((a, b) => ((b.hQty||0)+(b.pQty||0)) - ((a.hQty||0)+(a.pQty||0)));
        const limit = 99; 
        
        for (let i = 0; i < sorted.length; i += limit) {
            const batch = sorted.slice(i, i + limit);
            const partStr = sorted.length > limit ? `_Teil_${(i/limit)+1}` : '';
            const safeLabel = label.replace(/\s/g, '_').replace(/[()]/g, '');

            // 1. CSV GENERIEREN
            const content = ["NAME;ZUSATZ;STRASSE;NUMMER;PLZ;STADT;LAND;ADRESS_TYP", SENDER_ROW, 
                ...batch.map(r => `${toCsvCell(r.name)};${toCsvCell(r.zusatz)};${toCsvCell(r.strasse)};${toCsvCell(r.nummer)};${toCsvCell(formatPLZ(r.plz, r.landCode))};${toCsvCell(r.ort)};${toCsvCell(r.landCode)};${toCsvCell(r.type || 'HOUSE')}`)
            ].join('\r\n') + '\r\n';
            const blobCSV = new Blob([encodeWindows1252(content)], { type: 'text/csv;charset=windows-1252;' });
            const aCSV = document.createElement('a'); 
            aCSV.href = URL.createObjectURL(blobCSV); 
            aCSV.download = `Rhaetia_${safeLabel}${partStr}.csv`; 
            aCSV.click();

            // 2. BEGLEITLISTE GENERIEREN (nur wenn nötig)
            // Für die Begleitliste zählt nur die Reihenfolge der Empfänger im Batch.
            // Der Absender steht im CSV zwar an Position 1, wird in der Begleitliste aber nicht mitgezählt.
            // Also ist Index 0 im Batch = Pos. 1 auf dem Etikettenblatt.
            const begleitRecords = batch.map((r, idx) => ({ ...r, labelIndex: idx + 1 }))
                                        .filter(r => r.hQty > 1 || r.pQty > 1);

            if (begleitRecords.length > 0) {
                const begleitLines = [`BEGLEITLISTE - ${label}${partStr}\n\n`];
                begleitRecords.forEach(r => {
                    const page = Math.floor((r.labelIndex - 1) / 12) + 1;
                    const pos = ((r.labelIndex - 1) % 12) + 1;
                    begleitLines.push(`S. ${page}, Pos. ${pos} | ${r.name} | ${r.plz} ${r.ort} | ${r.hQty}x Herold, ${r.pQty}x Prog | ${r.totalWeight}g`);
                });
                const blobTXT = new Blob([begleitLines.join('\r\n')], { type: 'text/plain;charset=utf-8;' });
                const aTXT = document.createElement('a'); 
                aTXT.href = URL.createObjectURL(blobTXT); 
                aTXT.download = `Begleitliste_${safeLabel}${partStr}.txt`; 
                // Kurze Pause, damit der Browser nicht blockiert
                setTimeout(() => aTXT.click(), 500);
            }
        }
    };

    const filteredPreview = useMemo(() => results ? results.preview.filter(r => (r.name?.toLowerCase().includes(searchTerm.toLowerCase())) || (r.plz?.includes(searchTerm))) : [], [results, searchTerm]);
    const previewShipmentCount = useMemo(() => {
        if (!results) return 0;
        return results.preview.filter((r) => !r.excluded && !isNoShippingRecord(r)).length;
    }, [results]);

    const backConfig = useMemo(() => {
        switch (view) {
            case 'db-preview':
                return {
                    label: 'ZURÜCK ZUM STEP UPLOAD',
                    onClick: () => setView('upload'),
                };
            case 'preview':
                return {
                    label: 'ZURÜCK ZUM STEP CLEARING STATION',
                    onClick: () => setView('db-preview'),
                };
            case 'final':
                return {
                    label: 'ZURÜCK ZUM STEP VORSCHAU',
                    onClick: () => setView('preview'),
                };
            default:
                return null;
        }
    }, [view]);

    const renderDbCard = (dbRow, isSuggestion = false) => {
        const isPlzMatch = currentItemToMatch && formatPLZ(dbRow.PLZ || dbRow.plz, dbRow.LAND) === formatPLZ(currentItemToMatch.plz, currentItemToMatch.land);
        return (
            <div className={`flex flex-col w-full pr-4`}>
                <div className="font-black text-slate-800 dark:text-gray-100 text-sm mb-1">{dbRow.NAME}</div>
                {dbRow.ZUSATZ && <div className="text-xs text-slate-500 dark:text-gray-400 italic mb-2 flex items-center gap-1"><span className="text-slate-300 dark:text-gray-600">↳</span> {dbRow.ZUSATZ}</div>}
                <div className="grid grid-cols-2 gap-3 mt-2 bg-slate-50 dark:bg-gray-800 p-3 rounded-xl border border-slate-100 dark:border-gray-700">
                    <div>
                        <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 mb-1">Straße / Postfach</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">{dbRow.ADRESS_TYP === 'POBOX' ? `Postfach ${dbRow.NUMMER}` : `${dbRow.STRASSE} ${dbRow.NUMMER}`}</span>
                    </div>
                    <div>
                        <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 mb-1">Ort</span>
                        <span className={`text-xs font-semibold ${isPlzMatch ? 'text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded' : 'text-slate-700 dark:text-gray-200'}`}>{dbRow.PLZ}</span> <span className="text-xs text-slate-700 dark:text-gray-200">{dbRow.STADT} <span className="text-slate-400 dark:text-gray-500 font-normal">({dbRow.LAND})</span></span>
                    </div>
                </div>
            </div>
        );
    };

    const normalizeCompareValue = (value) =>
        String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');

    const compareValues = (source, target, allowContains = true) => {
        const s = normalizeCompareValue(source);
        const t = normalizeCompareValue(target);

        if (!s && !t) return 'empty';
        if (!s || !t) return 'mismatch';
        if (s === t) return 'exact';
        if (allowContains && (s.includes(t) || t.includes(s)) && Math.min(s.length, t.length) >= 4) return 'similar';
        return 'mismatch';
    };

    const getMatchInsights = (record) => {
        const sourceName = [record.anrede, record.titel, record.akad, record.vorname, record.nachname].filter(Boolean).join(' ');
        const sourceZusatz = record.originalRow?.[mapping.zusatz] || record.zusatz || '';
        const sourceStreet = record.originalRow?.[mapping.strasse] || record.strasse || '';
        const sourcePlz = formatPLZ(record.originalRow?.[mapping.plz] || record.plz, record.land || 'DEU');
        const sourceOrt = record.originalRow?.[mapping.ort] || record.ort || '';
        const sourceLand = String(record.originalRow?.[mapping.land] || record.land || 'DEU').toUpperCase();
        const sourceType = /postfach/i.test(sourceStreet) ? 'POBOX' : 'HOUSE';

        const targetName = record.name || '';
        const targetZusatz = record.zusatz || '';
        const targetStreet = record.type === 'POBOX' ? `Postfach ${record.nummer || ''}` : `${record.strasse || ''} ${record.nummer || ''}`.trim();
        const targetPlz = formatPLZ(record.plz, record.landCode);
        const targetOrt = record.ort || '';
        const targetLand = String(record.landCode || '').toUpperCase();
        const targetType = record.type || 'HOUSE';

        const plzStatus = compareValues(sourcePlz, targetPlz, false);
        const ortStatus = compareValues(sourceOrt, targetOrt, true);

        const fields = [
            { key: 'name', label: 'Name', source: sourceName, target: targetName, status: compareValues(sourceName, targetName, true) },
            { key: 'zusatz', label: 'Zusatz', source: sourceZusatz, target: targetZusatz, status: compareValues(sourceZusatz, targetZusatz, true) },
            { key: 'adresse', label: 'Straße/Nr', source: sourceStreet, target: targetStreet, status: compareValues(sourceStreet, targetStreet, true) },
            { key: 'plzOrt', label: 'PLZ/Ort', source: `${sourcePlz} ${sourceOrt}`.trim(), target: `${targetPlz} ${targetOrt}`.trim(), status: plzStatus === 'exact' && (ortStatus === 'exact' || ortStatus === 'similar') ? 'exact' : (plzStatus === 'exact' && ortStatus === 'mismatch' ? 'similar' : 'mismatch') },
            { key: 'land', label: 'Land', source: sourceLand, target: targetLand, status: compareValues(sourceLand, targetLand, false) },
            { key: 'typ', label: 'Typ', source: sourceType, target: targetType, status: compareValues(sourceType, targetType, false) },
        ];

        const scoreMap = { exact: 1, similar: 0.65, mismatch: 0 };
        const consideredFields = fields.filter((field) => field.status !== 'empty');
        const scoreRaw = consideredFields.length
            ? consideredFields.reduce((acc, field) => acc + (scoreMap[field.status] ?? 0), 0) / consideredFields.length
            : 1;
        const score = Math.min(100, Math.max(0, Math.round(scoreRaw * 100)));
        const mismatches = fields.filter((f) => f.status === 'mismatch').map((f) => f.label);

        return { fields, score, mismatches };
    };

    const getStatusClass = (status) => {
        if (status === 'exact') return 'text-emerald-700 bg-emerald-100 border-emerald-200';
        if (status === 'similar') return 'text-amber-700 bg-amber-100 border-amber-200';
        if (status === 'empty') return 'text-slate-500 bg-slate-100 border-slate-200';
        return 'text-red-700 bg-red-100 border-red-200';
    };

    const getScoreClass = (score) => {
        if (score >= 85) return 'text-emerald-800 bg-emerald-100 border-emerald-300';
        if (score >= 60) return 'text-amber-800 bg-amber-100 border-amber-300';
        return 'text-red-800 bg-red-100 border-red-300';
    };

    const getMatchHintClass = (hint) => {
        const msg = String(hint || '').toLowerCase();
        if (msg.includes('mehrdeutig') || msg.includes('unsicher')) return 'text-red-700 bg-red-50 border-red-200';
        if (msg.includes('keine adresse') || msg.includes('keine datenbank')) return 'text-sky-700 bg-sky-50 border-sky-200';
        if (msg.includes('manuell getrennt')) return 'text-slate-700 bg-slate-100 border-slate-200';
        return 'text-amber-700 bg-amber-50 border-amber-200';
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-6 sm:px-6 lg:px-8 font-sans text-slate-900 dark:text-gray-100 text-xs">
            <header className="max-w-7xl mx-auto mb-8 overflow-hidden rounded-[28px] border border-[#8e014d]/20 bg-[#8e014d] text-white shadow-[0_30px_80px_-30px_rgba(142,1,77,0.5)]">
                <div className="px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            {view === 'upload' ? (
                                <Link
                                    to="/"
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
                                >
                                    <ArrowLeft size={16} /> Dashboard
                                </Link>
                            ) : (
                                backConfig && (
                                    <button
                                        type="button"
                                        onClick={backConfig.onClick}
                                        className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
                                    >
                                        <ArrowLeft size={16} /> {backConfig.label}
                                    </button>
                                )
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <ThemeToggle />
                            {view !== 'upload' && !isProcessing && (
                                <button
                                    onClick={() => { setView('upload'); setResults(null); setPreMatchResults(null); }}
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
                                >
                                    Neustart
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/80 mb-3">
                        <FileText size={12} />
                        Internes Tool
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Rhaetia Post-Manager</h1>
                    <p className="mt-1 text-sm text-white/70">Versand-CSV für Rhaetia erstellen inkl. Porto-Berechnung.</p>
                </div>
            </header>

            <main className="max-w-7xl mx-auto">
                {view === 'upload' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                        <div className="lg:col-span-2 space-y-8">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-white dark:bg-gray-900 border-4 border-dashed border-slate-200 dark:border-gray-600 p-10 rounded-[2rem] text-center hover:border-[#8e014d] relative transition-all group">
                                    <input type="file" onChange={handleSourceUpload} accept=".xlsx, .xls, .csv" className="absolute inset-0 opacity-0 cursor-pointer" />
                                    <UploadCloud size={48} className="mx-auto mb-4 text-slate-300 dark:text-gray-600 group-hover:text-[#8e014d]" />
                                    <p className="text-lg font-black text-slate-600 dark:text-gray-300 uppercase">1. Quelldatei</p>
                                    {rawData.length > 0 && <p className="text-[#8e014d] font-bold mt-2">{rawData.length} Zeilen</p>}
                                    {uploadEncoding.source && <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 mt-1 uppercase tracking-wider">{uploadEncoding.source}</p>}
                                </div>
                                <div className="bg-white dark:bg-gray-900 border-4 border-dashed border-slate-200 dark:border-gray-600 p-10 rounded-[2rem] text-center hover:border-emerald-600 relative transition-all group">
                                    <input type="file" onChange={handleDbUpload} accept=".csv, .xlsx" className="absolute inset-0 opacity-0 cursor-pointer" />
                                    <Database size={48} className="mx-auto mb-4 text-slate-300 dark:text-gray-600 group-hover:text-emerald-600" />
                                    <p className="text-lg font-black text-slate-600 dark:text-gray-300 uppercase">2. Datenbank <span className="text-[10px] normal-case font-normal">(optional)</span></p>
                                    {dbData.length > 0 && <p className="text-emerald-600 font-bold mt-2">{dbData.length} Adressen</p>}
                                    {uploadEncoding.db && <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 mt-1 uppercase tracking-wider">{uploadEncoding.db}</p>}
                                </div>
                            </div>

                            {headers.length > 0 && (
                                <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl animate-in slide-in-from-bottom-4">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-10">
                                        {Object.keys(mapping).map(k => (
                                            <div key={k} className="flex flex-col gap-1">
                                                <label className="text-[9px] font-black text-[#8e014d] uppercase tracking-tighter">{k}</label>
                                                <select value={mapping[k]} onChange={e => setMapping({...mapping, [k]: e.target.value})} className="bg-slate-800 border-none text-white text-[10px] rounded-lg p-3 outline-none focus:ring-2 ring-[#8e014d]">
                                                    <option value="">- ignorieren -</option>
                                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-black text-[#8e014d] uppercase tracking-tighter">Groq API Key</label>
                                            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-slate-800 text-white text-[10px] p-4 rounded-xl outline-none focus:ring-2 ring-[#8e014d]" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-black text-[#8e014d] uppercase tracking-tighter">Anbieter</label>
                                            <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="w-full bg-slate-800 border-none text-white text-[10px] p-4 rounded-xl outline-none focus:ring-2 ring-[#8e014d]">
                                                <option value="groq">Groq (Cloud)</option>
                                                <option value="ollama">Ollama (Lokal)</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1 md:col-span-2">
                                            <label className="text-[9px] font-black text-[#8e014d] uppercase tracking-tighter">KI-Modell</label>
                                            {selectedProvider === 'groq' ? (
                                                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="w-full bg-slate-800 border-none text-white text-[10px] p-4 rounded-xl outline-none focus:ring-2 ring-[#8e014d]">
                                                <option value="llama-3.3-70b-versatile">Llama 3.3 70B (empfohlen)</option>
                                                <option value="llama-3.1-8b-instant">Llama 3.1 8B (schnell, hohes Limit)</option>
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    list="ollama-model-options"
                                                    value={ollamaModel}
                                                    onChange={(e) => setOllamaModel(e.target.value)}
                                                    className="w-full bg-slate-800 text-white text-[10px] p-4 rounded-xl outline-none focus:ring-2 ring-[#8e014d]"
                                                    placeholder="z.B. qwen2.5-coder:14b"
                                                />
                                            )}
                                            <datalist id="ollama-model-options">
                                                <option value="qwen2.5-coder:14b" />
                                                <option value="llama3.1:8b" />
                                            </datalist>
                                        </div>
                                    </div>
                                    <button onClick={prepareDbMatch} className="w-full bg-[#8e014d] py-5 rounded-2xl font-black text-xl hover:bg-[#b00260] transition-all flex justify-center items-center gap-3"><ListFilter fill="currentColor"/> DATENBANK ABGLEICHEN</button>
                                </div>
                            )}
                        </div>

                        {/* KLARES EINGABEFELD-DESIGN FÜR GEWICHTE */}
                        <div className="bg-white dark:bg-gray-900 p-10 rounded-[3rem] border-2 border-slate-100 dark:border-gray-800 shadow-sm">
                            <h3 className="text-[12px] font-black uppercase text-[#8e014d] mb-8 flex items-center gap-2"><Package size={16}/> Gewichte (g)</h3>
                            <div className="grid grid-cols-1 gap-6">
                                {Object.keys(weights).map(k => (
                                    <div key={k} className="pb-2">
                                        <label className="text-[9px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">{k}</label>
                                        <input
                                            type="number"
                                            value={weights[k]}
                                            onChange={e => setWeights({...weights, [k]: parseInt(e.target.value)||0})}
                                            className="w-full text-xl font-black text-slate-800 dark:text-gray-100 mt-2 bg-white dark:bg-gray-800 border-2 border-slate-300 dark:border-gray-700 focus:border-[#8e014d] focus:ring-4 focus:ring-[#8e014d]/10 rounded-xl p-3 shadow-sm outline-none transition-all"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {view === 'db-preview' && preMatchResults && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-6">
                            <h2 className="text-4xl font-black tracking-tighter uppercase italic">Clearing Station</h2>
                            {preMatchResults.unmatchedList.length > 0 && (
                                <button onClick={() => openManualEditor()} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase shadow-lg hover:bg-[#8e014d] transition-all flex items-center gap-2">
                                    <CheckSquare size={18} /> Editor für {preMatchResults.unmatchedList.length} öffnen
                                </button>
                            )}
                        </div>

                        <div className="flex gap-4 mb-6 border-b-2 border-slate-200 dark:border-gray-700 pb-4">
                            <button onClick={() => setActiveTab('matched')} className={`px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 ${activeTab === 'matched' ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-200' : 'bg-white dark:bg-gray-900 text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-gray-800'}`}>
                                <CheckCircle size={16} /> Automatisch gematcht ({preMatchResults.matchedList.filter(m=>m.fromDB).length})
                            </button>
                            <button onClick={() => setActiveTab('unmatched')} className={`px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 ${activeTab === 'unmatched' ? 'bg-amber-100 text-amber-800 border-2 border-amber-200' : 'bg-white dark:bg-gray-900 text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-gray-800'}`}>
                                <AlertTriangle size={16} /> KI benötigt / Manuell ({preMatchResults.unmatchedList.length})
                            </button>
                        </div>

                        {/* --- TAB 1: ERWEITERTE MATCHED ANSICHT --- */}
                        {activeTab === 'matched' && (
                            <div className="bg-white dark:bg-gray-900 border-2 border-slate-200 dark:border-gray-700 rounded-[2.5rem] overflow-hidden shadow-xl">
                                <div className="p-5 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 flex flex-wrap items-center justify-between gap-4">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-gray-400">
                                        Direktvergleich Quelle vs Datenbank
                                    </div>
                                    <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-gray-300 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showOnlyMismatches}
                                            onChange={(e) => setShowOnlyMismatches(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-[#8e014d] focus:ring-[#8e014d]"
                                        />
                                        Nur Abweichungen zeigen
                                    </label>
                                </div>
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-gray-800 border-b-2 text-[10px] uppercase font-black text-slate-400 dark:text-gray-500">
                                        <tr><th className="p-5">Quelle (Excel)</th><th className="p-5">Gefunden in Datenbank</th><th className="p-5">Match-Check & Aktion</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                                        {preMatchResults.matchedList
                                            .filter(m => m.fromDB)
                                            .filter((r) => {
                                                if (!showOnlyMismatches) return true;
                                                return getMatchInsights(r).mismatches.length > 0;
                                            })
                                            .map((r, i) => {
                                                const insights = getMatchInsights(r);
                                                const isExpanded = !!expandedMatchRows[r.id];
                                                return (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800 align-top">
                                                <td className="p-5">
                                                    <div className="space-y-2">
                                                        {insights.fields.map((f) => (
                                                            <div key={`source-${r.id}-${f.key}`} className="grid grid-cols-[68px_1fr] gap-2 items-start">
                                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500">{f.label}</span>
                                                                <span className="text-xs font-semibold text-slate-800 dark:text-gray-100 break-words">{f.source || '-'}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="p-5 font-bold text-emerald-900 bg-emerald-50/40">
                                                    <div className="space-y-2">
                                                        {insights.fields.map((f) => (
                                                            <div key={`target-${r.id}-${f.key}`} className="grid grid-cols-[68px_1fr] gap-2 items-start">
                                                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{f.label}</span>
                                                                <span className="text-xs font-semibold text-slate-900 dark:text-gray-100 break-words">{f.target || '-'}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="mt-3 text-[9px] uppercase tracking-widest font-black text-emerald-700 inline-flex items-center gap-2 bg-white dark:bg-gray-900 border border-emerald-200 rounded-md px-2 py-1">
                                                        <Database size={12} className="text-emerald-500"/> Aus Datenbank
                                                    </div>
                                                </td>
                                                <td className="p-5">
                                                    <div className="space-y-3">
                                                        <div className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getScoreClass(insights.score)}`}>
                                                            {insights.score}% Match
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {insights.fields.map((f) => (
                                                                <span key={`status-${r.id}-${f.key}`} className={`px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-wider ${getStatusClass(f.status)}`}>
                                                                    {f.label}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        {insights.mismatches.length > 0 && (
                                                            <div className="text-[10px] font-bold text-red-600 uppercase tracking-wide">
                                                                Abweichung: {insights.mismatches.join(', ')}
                                                            </div>
                                                        )}
                                                        <div className="inline-block bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200 px-2 py-1 rounded text-[9px] font-black uppercase">
                                                            📦 {r.hQty}x Herold, {r.pQty}x Programm
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedMatchRows((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                                                                className="text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 p-2 rounded-xl transition-colors text-[10px] font-bold uppercase border border-slate-200 dark:border-gray-700"
                                                            >
                                                                {isExpanded ? 'Weniger Details' : 'Alle Rohdaten'}
                                                            </button>
                                                            <button onClick={() => unmatchItem(r.id)} className="text-red-500 hover:text-white bg-red-50 hover:bg-red-500 p-2 rounded-xl transition-colors flex items-center gap-2 text-[10px] font-bold uppercase border border-red-100">
                                                                <Unlink size={14}/> Trennen
                                                            </button>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="bg-slate-900 text-slate-100 rounded-xl p-3 text-[10px] leading-relaxed overflow-auto">
                                                                <div className="font-black uppercase tracking-widest text-slate-400 mb-2">Rohdaten Quelle</div>
                                                                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(r.originalRow || {}, null, 2)}</pre>
                                                                <div className="font-black uppercase tracking-widest text-slate-400 mt-4 mb-2">Rohdaten Treffer</div>
                                                                <pre className="whitespace-pre-wrap break-words">{JSON.stringify({
                                                                    name: r.name,
                                                                    zusatz: r.zusatz,
                                                                    strasse: r.strasse,
                                                                    nummer: r.nummer,
                                                                    plz: r.plz,
                                                                    ort: r.ort,
                                                                    landCode: r.landCode,
                                                                    type: r.type,
                                                                }, null, 2)}</pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )})}
                                        {preMatchResults.matchedList.filter(m=>m.fromDB).length === 0 && <tr><td colSpan="3" className="p-10 text-center text-slate-400 dark:text-gray-500 italic">Keine automatischen Treffer.</td></tr>}
                                        {preMatchResults.matchedList.filter(m=>m.fromDB).length > 0 && preMatchResults.matchedList.filter(m=>m.fromDB).filter((r) => !showOnlyMismatches || getMatchInsights(r).mismatches.length > 0).length === 0 && (
                                            <tr><td colSpan="3" className="p-10 text-center text-slate-400 dark:text-gray-500 italic">Aktuell keine Abweichungen in den gematchten Datensätzen.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* --- TAB 2: UNMATCHED MIT EDIT-FUNKTION --- */}
                        {activeTab === 'unmatched' && (
                            <div className="bg-white dark:bg-gray-900 border-2 border-slate-200 dark:border-gray-700 rounded-[2.5rem] overflow-hidden shadow-xl">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-gray-800 border-b-2 text-[10px] uppercase font-black text-slate-400 dark:text-gray-500">
                                        <tr><th className="p-5">Quelle (Excel)</th><th className="p-5">Status</th><th className="p-5 text-right">Aktion</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                                        {preMatchResults.unmatchedList.map((r, i) => (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800">
                                                <td className="p-5">
                                                    <div className="font-bold text-slate-800 dark:text-gray-100">
                                                        {r.name || [r.anrede, r.titel, r.akad, r.vorname, r.nachname].filter(Boolean).join(' ')}
                                                        <span className="text-slate-400 dark:text-gray-500 italic font-normal ml-2">{r.zusatz}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 dark:text-gray-400 font-normal uppercase mt-1">
                                                        {r.strasse || '-'} {r.nummer || ''}, <span className="font-bold text-[#8e014d]">{r.plz || '-'}</span> {r.ort || '-'} ({normalizeCountryCode(r.landCode || r.land || 'DEU') || 'DEU'})
                                                    </div>
                                                </td>
                                                <td className="p-5">
                                                    <div className="space-y-2">
                                                        <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${r.isFrozen ? 'bg-slate-200 text-slate-700 border-slate-300' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                                                            {r.isFrozen ? 'Eingefroren' : 'Manuell bearbeiten'}
                                                        </span>
                                                        {r.matchHint && (
                                                            <div className={`text-[10px] font-semibold max-w-xs border rounded-md px-2 py-1 ${getMatchHintClass(r.matchHint)}`}>
                                                                DB-Hinweis: {r.matchHint}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-5 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => openManualEditor(r)} className="text-slate-600 dark:text-gray-300 hover:text-white bg-slate-100 dark:bg-gray-800 hover:bg-slate-900 dark:hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-[10px] font-bold uppercase border border-slate-200 dark:border-gray-700">
                                                            <CheckSquare size={14}/> Editor öffnen
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* MODAL FÜR MANUELLEN DB-EDITOR */}
                {matchModalOpen && currentItemToMatch && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-4 animate-in fade-in">
                        <div className="bg-slate-100 dark:bg-gray-950 rounded-[2rem] w-full max-w-7xl h-[96vh] max-h-[96vh] overflow-hidden flex flex-col shadow-2xl border border-slate-300 dark:border-gray-700">
                            <div className="bg-white dark:bg-gray-900 p-4 border-b border-slate-200 dark:border-gray-700 flex justify-between items-center shrink-0 gap-4">
                                <h3 className="text-2xl font-black uppercase italic text-slate-800 dark:text-gray-100">Manueller DB-Editor</h3>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-gray-400 bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-3 py-1 rounded-lg">
                                        {modalItemIndex >= 0 ? `${modalItemIndex + 1} / ${modalUnmatchedList.length}` : '-'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => navigateModalItem(-1)}
                                        disabled={modalItemIndex <= 0}
                                        className="text-slate-500 dark:text-gray-400 disabled:text-slate-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed hover:text-slate-800 dark:hover:text-gray-100 bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-2 rounded-lg transition-colors"
                                        title="Vorheriger Eintrag"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigateModalItem(1)}
                                        disabled={modalItemIndex === -1 || modalItemIndex >= modalUnmatchedList.length - 1}
                                        className="text-slate-500 dark:text-gray-400 disabled:text-slate-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed hover:text-slate-800 dark:hover:text-gray-100 bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-2 rounded-lg transition-colors"
                                        title="Nächster Eintrag"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={toggleFreezeCurrent}
                                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase border transition-colors ${currentItemToMatch?.isFrozen ? 'bg-slate-800 text-white border-slate-800' : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 border-slate-200 dark:border-gray-700 hover:border-slate-400 dark:hover:border-gray-500'}`}
                                    >
                                        {currentItemToMatch?.isFrozen ? <Lock size={14} /> : <Unlock size={14} />}
                                        {currentItemToMatch?.isFrozen ? 'Entsperren' : 'Einfrieren'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={finishManualEditing}
                                        className="bg-[#8e014d] text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase"
                                    >
                                        Fertigstellen
                                    </button>
                                    <button onClick={() => setMatchModalOpen(false)} className="text-slate-400 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-100 transition-colors"><XCircle size={28} /></button>
                                </div>
                            </div>
                            <div className="p-4 flex-1 min-h-0">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                                    <div className="lg:col-span-2 grid grid-rows-[auto_1fr] gap-4 min-h-0">
                                        <div className="bg-slate-800 text-white rounded-2xl p-4 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none"><Info size={100}/></div>
                                            <h4 className="text-[9px] font-black uppercase text-emerald-400 mb-3 tracking-widest bg-emerald-900/40 inline-block px-3 py-1 rounded-md border border-emerald-800">Rohdaten aus Excel</h4>
                                            <div className="space-y-3 relative z-10">
                                                <div>
                                                    <span className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Name / Institution</span>
                                                    <span className="font-bold text-base block">{[currentItemToMatch.anrede, currentItemToMatch.titel, currentItemToMatch.akad, currentItemToMatch.vorname, currentItemToMatch.nachname].filter(Boolean).join(' ') || currentItemToMatch.name || '-'}</span>
                                                    {currentItemToMatch.zusatz && <span className="text-sm italic text-slate-300 block mt-1">↳ {currentItemToMatch.zusatz}</span>}
                                                </div>
                                                <div>
                                                    <span className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Adresse</span>
                                                    <span className="font-semibold text-sm block">{`${currentItemToMatch.strasse || '-'} ${currentItemToMatch.nummer || ''}`.trim()}</span>
                                                    <span className="text-xs text-slate-300 block mt-0.5"><span className="text-white font-bold">{currentItemToMatch.plz || '-'}</span> {currentItemToMatch.ort || '-'} ({normalizeCountryCode(currentItemToMatch.landCode || currentItemToMatch.land || 'DEU') || 'DEU'})</span>
                                                </div>
                                                <div className="text-[10px] uppercase font-black tracking-widest inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-slate-600 bg-slate-700/40">
                                                    {currentItemToMatch.isFrozen ? <Lock size={12}/> : <Unlock size={12}/>}
                                                    {currentItemToMatch.isFrozen ? 'Eingefroren' : 'Bearbeitbar'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 flex flex-col min-h-0">
                                            <h4 className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3">DB-Felder bearbeiten</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input disabled={currentItemToMatch.isFrozen} type="text" value={editorFormData.name} onChange={(e) => setEditorFormData((prev) => ({ ...prev, name: e.target.value }))} placeholder="NAME" className="col-span-2 border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 p-2.5 rounded text-xs font-bold disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:text-slate-400 dark:disabled:text-gray-500" />
                                                <input disabled={currentItemToMatch.isFrozen} type="text" value={editorFormData.zusatz} onChange={(e) => setEditorFormData((prev) => ({ ...prev, zusatz: e.target.value }))} placeholder="ZUSATZ" className="col-span-2 border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 p-2.5 rounded text-xs disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:text-slate-400 dark:disabled:text-gray-500" />
                                                <input disabled={currentItemToMatch.isFrozen} type="text" value={editorFormData.strasse} onChange={(e) => setEditorFormData((prev) => ({ ...prev, strasse: e.target.value }))} placeholder="STRASSE" className="border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 p-2.5 rounded text-xs disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:text-slate-400 dark:disabled:text-gray-500" />
                                                <input disabled={currentItemToMatch.isFrozen} type="text" value={editorFormData.nummer} onChange={(e) => setEditorFormData((prev) => ({ ...prev, nummer: e.target.value }))} placeholder="NUMMER" className="border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 p-2.5 rounded text-xs disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:text-slate-400 dark:disabled:text-gray-500" />
                                                <input disabled={currentItemToMatch.isFrozen} type="text" value={editorFormData.plz} onChange={(e) => setEditorFormData((prev) => ({ ...prev, plz: e.target.value }))} placeholder="PLZ" className="border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 p-2.5 rounded text-xs font-bold disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:text-slate-400 dark:disabled:text-gray-500" />
                                                <input disabled={currentItemToMatch.isFrozen} type="text" value={editorFormData.stadt} onChange={(e) => setEditorFormData((prev) => ({ ...prev, stadt: e.target.value }))} placeholder="STADT" className="border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 p-2.5 rounded text-xs disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:text-slate-400 dark:disabled:text-gray-500" />
                                                <input disabled={currentItemToMatch.isFrozen} type="text" value={editorFormData.land} onChange={(e) => setEditorFormData((prev) => ({ ...prev, land: e.target.value.toUpperCase() }))} placeholder="LAND (DEU/CHE/AUT...)" className="border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 p-2.5 rounded text-xs font-bold disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:text-slate-400 dark:disabled:text-gray-500" />
                                                <select disabled={currentItemToMatch.isFrozen} value={editorFormData.adressTyp} onChange={(e) => setEditorFormData((prev) => ({ ...prev, adressTyp: e.target.value }))} className="border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 p-2.5 rounded text-xs disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:text-slate-400 dark:disabled:text-gray-500">
                                                    <option value="HOUSE">HOUSE</option>
                                                    <option value="POBOX">POBOX</option>
                                                </select>
                                            </div>
                                            <div className="mt-auto pt-3 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={saveCurrentEditorItem}
                                                    disabled={currentItemToMatch.isFrozen}
                                                    className="bg-slate-900 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase disabled:bg-slate-300 dark:disabled:bg-gray-700"
                                                >
                                                    Speichern
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => navigateModalItem(1)}
                                                    disabled={modalItemIndex === -1 || modalItemIndex >= modalUnmatchedList.length - 1}
                                                    className="bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 px-4 py-2 rounded-lg text-[10px] font-black uppercase border border-slate-200 dark:border-gray-700 disabled:opacity-40"
                                                >
                                                    Speichern & Weiter
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-full flex flex-col min-h-0">
                                        <h4 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Search size={14} className="text-[#8e014d]"/> Datenbank durchsuchen</h4>
                                        <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
                                            <div className="relative my-2">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                <input type="text" placeholder="Nachname, Name, Straße oder PLZ..." value={manualSearchQuery} onChange={e => setManualSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 outline-none focus:border-[#8e014d] text-sm font-semibold shadow-inner" />
                                            </div>
                                            {manualSearchResults.map((dbRow, idx) => (
                                                <div key={`manual-${idx}`} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border-2 border-slate-200 dark:border-gray-700 hover:border-[#8e014d] flex flex-col justify-between items-start transition-colors shadow-sm gap-3">
                                                    {renderDbCard(dbRow, false)}
                                                    <button onClick={() => applyDbResultToEditor(dbRow)} className="w-full bg-slate-100 text-slate-600 hover:bg-[#8e014d] hover:text-white py-3 rounded-xl font-bold uppercase text-[10px] flex justify-center items-center gap-2 transition-colors"><CheckSquare size={14}/> Übernehmen</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- VORSCHAU --- */}
                {view === 'preview' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-end gap-4 mb-6">
                            <h2 className="text-4xl font-black tracking-tighter uppercase italic">{isProcessing ? 'Verarbeitung...' : 'Vorschau'}</h2>
                            {!isProcessing && results && (
                                <div className="flex gap-4 items-center">
                                    <div className="relative w-64"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} /><input type="text" placeholder="Suchen..." className="w-full pl-10 pr-4 py-2 rounded-xl border-2 border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 outline-none focus:border-[#8e014d]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                                    <button onClick={() => setView('final')} className="bg-[#8e014d] text-white px-10 py-3 rounded-2xl font-black uppercase shadow-lg hover:scale-105 transition-all">Downloads</button>
                                </div>
                            )}
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border-2 border-slate-200 dark:border-gray-700 flex flex-wrap gap-10 items-center justify-between shadow-sm">
                            <div className="flex gap-10">
                                <div className="text-center"><p className="text-3xl font-black text-emerald-600">{procStats.db}</p><p className="text-[10px] font-bold uppercase text-slate-400 dark:text-gray-500">Aus Datenbank</p></div>
                                <div className="text-center"><p className="text-3xl font-black text-[#8e014d]">{procStats.ai}</p><p className="text-[10px] font-bold uppercase text-slate-400 dark:text-gray-500">Manuell geprüft</p></div>
                                <div className="text-center"><p className="text-3xl font-black text-slate-800 dark:text-gray-100">{previewShipmentCount}</p><p className="text-[10px] font-bold uppercase text-slate-400 dark:text-gray-500">Sendungen gesamt</p></div>
                            </div>
                            {isProcessing && procStats.ai > 0 && (
                                <div className="flex-1 max-w-md ml-auto">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 dark:text-gray-500 mb-2"><span className="flex items-center gap-1"><Loader2 className="animate-spin" size={12}/> Verarbeitung läuft...</span><span className="text-[#8e014d]">{procStats.progress}%</span></div>
                                    <div className="w-full bg-slate-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden p-0.5"><div className="bg-[#8e014d] h-full transition-all duration-500" style={{ width: `${procStats.progress}%` }}></div></div>
                                    <div className="text-right text-[10px] text-slate-500 dark:text-gray-400 font-bold">Restzeit: {formatETA(procStats.eta)}</div>
                                </div>
                            )}
                        </div>
                        {results && (
                            <div className="bg-white dark:bg-gray-900 border-2 border-slate-200 dark:border-gray-700 rounded-[2.5rem] overflow-hidden shadow-xl mt-6">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-gray-800 border-b-2 text-[10px] uppercase font-black text-slate-400 dark:text-gray-500">
                                        <tr><th className="p-5">Name (Z.1)</th><th className="p-5">Zusatz (Z.2)</th><th className="p-5">Adresse / Land</th><th className="p-5 text-right">Versand / Porto</th><th className="p-5 text-right">Aktion</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                                        {filteredPreview.map((r, i) => (
                                            <tr key={i} className={`${r.excluded ? 'bg-slate-100 text-slate-500' : r.errorMsg ? 'bg-red-300 text-red-950 border-y-2 border-red-500' : r.label === 'Kein Versand' ? 'bg-red-100 text-red-900 opacity-70' : ''}`}>
                                                <td className="p-5 font-bold">{r.fromDB && <Database size={10} className="inline text-emerald-500 mr-2" />}{r.name}</td>
                                                <td className="p-5 opacity-60 italic">{r.zusatz || '-'}</td>
                                                <td className="p-5"><div className="font-semibold">{`${r.strasse || ''} ${r.nummer || ''}`.trim()}</div><div className="text-[10px] uppercase mt-1">{`${r.plz || ''} ${r.ort || ''}`.trim()} ({r.landCode || ''})</div></td>
                                                <td className="p-5 text-right"><div className="font-black text-[#8e014d] uppercase tracking-tighter">{r.label}</div>{r.price > 0 && (<div className="text-[9px] font-bold text-slate-400 mt-1 uppercase">{r.hQty}xH, {r.pQty}xP | {r.totalWeight}g = {r.price.toFixed(2)} €</div>)}{r.errorMsg && <div className="text-[10px] font-black text-red-900 mt-2 bg-red-100 border border-red-400 rounded-md px-2 py-1 inline-block">{r.errorMsg}</div>}</td>
                                                <td className="p-5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => togglePreviewExclusion(r.id)}
                                                        disabled={isNoShippingRecord(r)}
                                                        className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase border transition-colors ${isNoShippingRecord(r) ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed' : r.excluded ? 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                                                    >
                                                        {isNoShippingRecord(r) ? 'Kein Versand' : (r.excluded ? 'Wieder aufnehmen' : 'Rausnehmen')}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* --- FINALE DOWNLOADS (Neu gruppiert) --- */}
                {view === 'final' && results && (
                    <div className="space-y-10 animate-in zoom-in-95 duration-500">
                        <div className="bg-[#8e014d] p-16 rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
                            <div className="relative z-10"><p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-80">Gesamtes Briefporto</p><h2 className="text-8xl font-black mt-2 tracking-tighter italic">{results.totalCost.toFixed(2)} €</h2><p className="text-[10px] font-bold uppercase tracking-widest mt-3 opacity-80">nur Briefport, keine Pakete</p></div>
                            <div className="bg-white/10 p-10 rounded-[2.5rem] backdrop-blur-xl border border-white/20 text-center relative z-10"><p className="text-5xl font-black">{Object.values(results.groups).reduce((acc, arr) => acc + arr.length, 0)}</p><p className="text-[10px] font-black uppercase opacity-80 tracking-widest mt-2">Sendungen Gesamt</p></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {Object.entries(results.groups).map(([label, records]) => (
                                <div key={label} className="p-8 bg-white dark:bg-gray-900 rounded-[3rem] border-2 dark:border-gray-700 flex flex-col justify-between hover:border-[#8e014d] transition-all shadow-sm">
                                    <div className="mb-6 text-center">
                                        <h4 className="text-lg font-black uppercase italic text-slate-800 dark:text-gray-100">{label}</h4>
                                        <p className="text-[#8e014d] font-bold mt-1 uppercase tracking-widest">{records.length} Sendungen</p>
                                    </div>
                                    <button onClick={() => downloadCSV(label, records)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-[#8e014d] transition-all active:scale-95 text-sm">
                                        <Download size={18}/> CSV & BEGLEITLISTE
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {(view === 'db-preview' || view === 'preview') && (
                <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-4 py-3 text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-[#8e014d] transition-colors"
                >
                    <ArrowUp size={14} /> Nach oben
                </button>
            )}
        </div>
    );
}