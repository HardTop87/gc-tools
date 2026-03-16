import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
    ArrowLeft, Download, UploadCloud, AlertTriangle, 
    Search, XCircle, FileText, Package, Truck, Zap,
    Database, CheckCircle, Clock, Loader2, ListFilter,
    Unlink, CheckSquare, Info, Edit3, Save, X
} from 'lucide-react';
import * as XLSX from 'xlsx';

// --- KONFIGURATION ---
const SENDER_ROW = "K.B.St.V. Rhaetia;Herold-Schriftleitung;Luisenstr.;27;80333;München;DEU;HOUSE";

const INITIAL_WEIGHTS = { 
    heroldNetto: 170, heroldBrutto: 200, 
    programmNetto: 15, programmBrutto: 18 
};

const RATES = {
    de: { standard: 0.85, kompakt: 1.00, gross: 1.60, maxi: 2.75, paket: 5.49 },
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

const formatPLZ = (plz, land) => {
    let p = String(plz || '').trim();
    const l = String(land || 'DEU').toUpperCase();
    if ((l.includes('DE') || l === '') && p.length > 0 && p.length < 5) {
        return p.padStart(5, '0');
    }
    return p;
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

export default function PostVersandManager() {
    const [apiKey, setApiKey] = useState(import.meta.env.VITE_GROQ_API_KEY || '');
    const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile'); 
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
    
    const [editingItemId, setEditingItemId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    const [results, setResults] = useState(null);
    const [view, setView] = useState('upload'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [procStats, setProcStats] = useState({ ai: 0, db: 0, total: 0, eta: 0, progress: 0 });

    const handleSourceUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target.result, { type: 'array' });
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
            
            const hIdx = data.findIndex(r => r && r.some(c => String(c||'').toLowerCase().includes('nachname')));
            if (hIdx === -1) return alert("Konnte Kopfzeile nicht finden!");
            
            const currentHeaders = data[hIdx].map(h => String(h || '').trim());
            setHeaders(currentHeaders);
            setRawData(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { range: hIdx }));
            
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
        const reader = new FileReader();
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target.result, { type: 'array' });
            setDbData(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
        };
        reader.readAsArrayBuffer(file);
    };

    const getVersandArt = (gewicht, landCode) => {
        const isDE = landCode === 'DEU' || landCode === 'DE';
        const rates = isDE ? RATES.de : RATES.intl;
        const prefix = isDE ? "" : "Int. ";

        if (gewicht <= 20) return { label: prefix + 'Standardbrief', price: rates.standard };
        if (gewicht <= 50) return { label: prefix + 'Kompaktbrief', price: rates.kompakt };
        if (gewicht <= 500) return { label: prefix + 'Großbrief', price: rates.gross };
        if (gewicht <= 1000) return { label: prefix + 'Maxibrief', price: rates.maxi };
        return { label: prefix + 'Paket', price: rates.paket, isDHL: true };
    };

    const findInDatabase = (rawRow) => {
        if (!dbData || dbData.length === 0) return null;
        const rawLand = String(rawRow.land || 'DEU').toUpperCase();
        const rawPlz = formatPLZ(rawRow.plz, rawLand);
        const sourceCloud = cleanForMatch(`${rawRow.anrede} ${rawRow.titel} ${rawRow.vorname} ${rawRow.nachname} ${rawRow.zusatz}`);
        const sourceNumbers = extractNumbers(rawRow.strasse);

        return dbData.find(dbRow => {
            const dbLand = String(dbRow.LAND || dbRow.landCode || 'DEU').toUpperCase();
            const dbPlz = formatPLZ(dbRow.PLZ || dbRow.plz, dbLand);
            if (dbPlz !== rawPlz) return false;

            const dbNameClean = cleanForMatch(dbRow.NAME);
            const dbNumbers = extractNumbers(`${dbRow.STRASSE} ${dbRow.NUMMER}`);

            let nameMatch = false;
            if (sourceCloud.includes(dbNameClean) || dbNameClean.includes(sourceCloud)) {
                nameMatch = true;
            } else {
                const lastName = cleanForMatch(rawRow.nachname);
                if (lastName && lastName.length > 3 && dbNameClean.includes(lastName)) {
                    nameMatch = true;
                }
            }
            if (!nameMatch) return false;

            if (sourceNumbers && dbNumbers) {
                if (!dbNumbers.includes(sourceNumbers) && !sourceNumbers.includes(dbNumbers)) return false;
            }

            return true;
        });
    };

    const prepareDbMatch = () => {
        if (!apiKey && dbData.length === 0) return alert("Ohne API Key musst du zumindest eine Datenbank hochladen!");
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

            const cached = findInDatabase(mini);
            if (cached) {
                const ship = getVersandArt(weight, cached.LAND || cached.landCode);
                matchedList.push({ ...mini, name: cached.NAME, zusatz: cached.ZUSATZ, strasse: cached.STRASSE, nummer: cached.NUMMER, plz: cached.PLZ, ort: cached.STADT || cached.ORT, landCode: cached.LAND || cached.landCode, type: cached.ADRESS_TYP || 'HOUSE', label: ship.label, price: ship.price, isDHL: ship.isDHL, fromDB: true });
            } else unmatchedList.push(mini);
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
                totalWeight: itemToUnmatch.totalWeight, originalRow: itemToUnmatch.originalRow
            };
            return { matchedList: newMatched, unmatchedList: [...prev.unmatchedList, resetItem] };
        });
    };

    // --- NEU: INLINE EDITING FUNKTIONEN ---
    const startEditing = (item) => {
        setEditingItemId(item.id);
        setEditFormData({
            anrede: item.anrede || '', titel: item.titel || '', vorname: item.vorname || '', 
            nachname: item.nachname || '', zusatz: item.zusatz || '', strasse: item.strasse || '', 
            plz: item.plz || '', ort: item.ort || ''
        });
    };

    const saveEdit = () => {
        setPreMatchResults(prev => {
            const updatedUnmatched = prev.unmatchedList.map(item => {
                if (item.id === editingItemId) {
                    return { ...item, ...editFormData };
                }
                return item;
            });
            return { ...prev, unmatchedList: updatedUnmatched };
        });
        setEditingItemId(null);
    };


    const manualMatch = (dbRow) => {
        if (!currentItemToMatch) return;
        const shipping = getVersandArt(currentItemToMatch.totalWeight, dbRow.LAND || dbRow.landCode);
        const newItem = {
            ...currentItemToMatch, name: dbRow.NAME, zusatz: dbRow.ZUSATZ, strasse: dbRow.STRASSE, nummer: dbRow.NUMMER,
            plz: dbRow.PLZ, ort: dbRow.STADT || dbRow.ORT, landCode: dbRow.LAND || dbRow.landCode, type: dbRow.ADRESS_TYP || 'HOUSE',
            label: shipping.label, price: shipping.price, isDHL: shipping.isDHL, fromDB: true 
        };
        setPreMatchResults(prev => ({ matchedList: [...prev.matchedList, newItem], unmatchedList: prev.unmatchedList.filter(m => m.id !== currentItemToMatch.id) }));
        setMatchModalOpen(false); setCurrentItemToMatch(null); setManualSearchQuery('');
    };

    const getFuzzySuggestions = (item) => {
        if (!item || dbData.length === 0) return [];
        const sourceCloud = cleanForMatch(`${item.anrede} ${item.titel} ${item.vorname} ${item.nachname} ${item.zusatz}`);
        const rawPlz = formatPLZ(item.plz, item.land);
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
        const q = manualSearchQuery.toLowerCase();
        return dbData.filter(dbRow => `${dbRow.NAME} ${dbRow.STRASSE} ${dbRow.PLZ} ${dbRow.STADT}`.toLowerCase().includes(q)).slice(0, 10); 
    }, [manualSearchQuery, dbData]);


    const runAiProcessing = async () => {
        setIsProcessing(true); setView('preview');
        const { matchedList, unmatchedList } = preMatchResults;
        const previewList = [...matchedList]; 
        const totalAIItems = unmatchedList.length;

        setProcStats({ ai: totalAIItems, db: matchedList.filter(m=>m.fromDB).length, total: rawData.length, eta: 0, progress: 0 });

        if (totalAIItems > 0 && apiKey) {
            const chunkSize = 10; const chunks = [];
            for (let i = 0; i < totalAIItems; i += chunkSize) chunks.push(unmatchedList.slice(i, i + chunkSize));
            const startTime = Date.now();

            for (let i = 0; i < chunks.length; i++) {
                let retries = 0; let success = false;
                while (!success && retries < 3) {
                    try {
                        if (i > 0) await delay(4000);
                        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: selectedModel, 
                                messages: [
                                    {
                                        role: "system",
                                        content: `Du bist ein Daten-Experte für den postalischen Versand. Formatiere die eingehenden JSON-Rohdaten in ein sauberes, versandfertiges JSON-Array.

                                        HARTE REGELN:
                                        1. ANREDE & TITEL: Beginne IMMER mit der Anrede ("Herr", "Frau"). Lösche Berufsbezeichnungen, niedrige Grade (Dipl., B.Sc., M.A.) und Fakultäten (med., habil., rer. nat.) radikal! Behalte nur "Dr.", "Prof.", "OSB". Das Feld 'name' darf NIEMALS leer sein!
                                        2. PFLEGEHEIME & WOHNSTIFTE: Person ist 'name' (Zeile 1). Das Heim (inkl. Appartement) ist der 'zusatz' (Zeile 2).
                                        3. INSTITUTIONEN: Einrichtung ist 'name' (Zeile 1). Ansprechpartner ist 'zusatz' (Zeile 2) mit dem Präfix "z.Hd. ".
                                        4. STRASSEN-EXTRAKTION: Wenn bei einem Kloster oder Heim die Straße im Einrichtungsnamen steht (z.B. "Kloster Andechs, Bergstraße 2"), trenne das zwingend! Straße und Hausnummer gehören IMMER in die Felder 'strasse' und 'nummer'.
                                        5. POSTFACH VS STRASSE: Wenn in der Quelle eine Straße UND ein Postfach stehen, hat das Postfach IMMER Vorrang! Setze 'type' auf 'POBOX', die Postfachnummer in 'nummer' und lasse 'strasse' komplett leer!
                                        6. LAND: Zwingend 3-stelliger ISO-Code (DEU, CHE, AUT, ITA).
                                        7. BRIEFTRÄGER-CHECK: Fehlt der Name, der Ort oder die PLZ? Dann schreibe den Grund in 'hinweis'.

                                        FORMAT-BEISPIELE:
                                        - Quelle: Stadtarchiv München, Dr. Hans Meier, Burgstr. 1 -> "name": "Stadtarchiv München", "zusatz": "z.Hd. Herr Dr. Hans Meier", "strasse": "Burgstr.", "nummer": "1"
                                        - Quelle: Bayerisches Hauptstaatsarchiv Schönfeldstr. 5 - Postfach -221152- -> "name": "Bayerisches Hauptstaatsarchiv", "zusatz": "", "strasse": "", "nummer": "221152", "type": "POBOX"
                                        
                                        ANTWORTE AUSSCHLIESSLICH ALS GÜLTIGES JSON IN DIESEM FORMAT:
                                        {"adressen": [{"id": 1, "name": "...", "zusatz": "...", "strasse": "...", "nummer": "...", "plz": "...", "ort": "...", "landCode": "DEU", "type": "HOUSE", "hinweis": ""}]}`
                                    },
                                    { role: "user", content: `Bereinige: ${JSON.stringify(chunks[i])}` }
                                ],
                                temperature: 0.1, response_format: { type: "json_object" }
                            })
                        });

                        if (!response.ok) { if (response.status === 429) { await delay(5000); retries++; continue; } throw new Error(`API Fehler: ${response.status}`); }

                        const content = JSON.parse((await response.json()).choices[0].message.content);
                        const aiData = content.adressen || Object.values(content)[0];

                        aiData.forEach(ai => {
                            const original = chunks[i].find(c => c.id === ai.id);
                            if (!original) return;
                            const shipping = getVersandArt(original.totalWeight, ai.landCode);
                            const isError = !ai.plz || !ai.ort || !ai.name;
                            previewList.push({
                                ...original, ...ai, plz: formatPLZ(ai.plz, ai.landCode), 
                                label: shipping.label, price: isError ? 0 : shipping.price, isDHL: shipping.isDHL,
                                errorMsg: isError ? "Unvollständige Adresse" : ai.hinweis, fromDB: false
                            });
                        });
                        
                        currentProcessedCount += chunks[i].length;
                        const elapsedMs = Date.now() - startTime;
                        setProcStats(prev => ({ ...prev, eta: (totalAIItems - currentProcessedCount) * (elapsedMs / currentProcessedCount), progress: Math.round((currentProcessedCount / totalAIItems) * 100) }));
                        success = true;
                        setResults({ preview: [...previewList], groups: {}, totalCost: 0 }); 
                    } catch (err) { retries++; await delay(3000); }
                }
            }
        }

        // --- NEU: GRANULARE GRUPPIERUNG ---
        const groups = {}; let totalCost = 0;
        previewList.forEach(rec => {
            if (rec.label === 'Kein Versand' || rec.errorMsg) return;
            
            // Ermittle den Produkt-Mix
            let mix = '';
            if (rec.hQty > 0 && rec.pQty === 0) mix = 'nur Herold';
            else if (rec.hQty === 0 && rec.pQty > 0) mix = 'nur Semesterprogramm';
            else mix = 'Herold + Semesterprogramm';
            
            const groupKey = `${rec.label} (${mix})`; // z.B. "Großbrief (nur Herold)"

            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(rec);
            totalCost += rec.price;
        });

        setResults({ preview: previewList, groups, totalCost });
        setIsProcessing(false);
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
                ...batch.map(r => `"${r.name}";"${r.zusatz||''}";"${r.strasse||''}";"${r.nummer||''}";"${formatPLZ(r.plz, r.landCode)}";"${r.ort}";"${r.landCode}";"${r.type||'HOUSE'}"`)
            ].join('\r\n');
            const blobCSV = new Blob([content], { type: 'text/csv;charset=utf-8;' });
            const aCSV = document.createElement('a'); 
            aCSV.href = URL.createObjectURL(blobCSV); 
            aCSV.download = `Rhaetia_${safeLabel}${partStr}.csv`; 
            aCSV.click();

            // 2. BEGLEITLISTE GENERIEREN (nur wenn nötig)
            // batchIdx ist 1-basiert, beginnend bei 1 für das erste Etikett NACH dem Absender.
            // Die Post druckt 1. Etikett = Absender, 2. Etikett = Empfänger 1 usw.
            // Also ist Index 0 in 'batch' = Etikett 2.
            const begleitRecords = batch.map((r, idx) => ({ ...r, labelIndex: idx + 2 }))
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
                <div className="font-black text-slate-800 text-sm mb-1">{dbRow.NAME}</div>
                {dbRow.ZUSATZ && <div className="text-xs text-slate-500 italic mb-2 flex items-center gap-1"><span className="text-slate-300">↳</span> {dbRow.ZUSATZ}</div>}
                <div className="grid grid-cols-2 gap-3 mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                        <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Straße / Postfach</span>
                        <span className="text-xs font-semibold text-slate-700">{dbRow.ADRESS_TYP === 'POBOX' ? `Postfach ${dbRow.NUMMER}` : `${dbRow.STRASSE} ${dbRow.NUMMER}`}</span>
                    </div>
                    <div>
                        <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Ort</span>
                        <span className={`text-xs font-semibold ${isPlzMatch ? 'text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded' : 'text-slate-700'}`}>{dbRow.PLZ}</span> <span className="text-xs text-slate-700">{dbRow.STADT} <span className="text-slate-400 font-normal">({dbRow.LAND})</span></span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-100 p-6 md:p-12 font-sans text-slate-900 text-xs">
            <header className="max-w-7xl mx-auto mb-10">
                <div className="mb-4 min-h-6">
                    {view === 'upload' ? (
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 text-slate-400 hover:text-[#8e014d] transition-colors text-xs font-black uppercase tracking-widest"
                        >
                            <ArrowLeft size={16} /> Dashboard
                        </Link>
                    ) : (
                        backConfig && (
                            <button
                                type="button"
                                onClick={backConfig.onClick}
                                className="inline-flex items-center gap-2 text-slate-400 hover:text-[#8e014d] transition-colors text-xs font-black uppercase tracking-widest"
                            >
                                <ArrowLeft size={16} /> {backConfig.label}
                            </button>
                        )
                    )}
                </div>

                <div className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#8e014d] p-3 rounded-2xl shadow-lg text-white"><FileText size={24} /></div>
                        <h1 className="text-xl font-black italic uppercase tracking-tighter">Rhaetia <span className="text-[#8e014d] not-italic text-sm">Post-Manager</span></h1>
                    </div>
                    {view !== 'upload' && !isProcessing && <button onClick={() => { setView('upload'); setResults(null); setPreMatchResults(null); }} className="bg-white border-2 border-slate-200 px-6 py-2 rounded-xl font-bold hover:bg-slate-50 transition-all uppercase text-[10px] tracking-widest">Neustart</button>}
                </div>
            </header>

            <main className="max-w-7xl mx-auto">
                {view === 'upload' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                        <div className="lg:col-span-2 space-y-8">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-white border-4 border-dashed border-slate-200 p-10 rounded-[2rem] text-center hover:border-[#8e014d] relative transition-all group">
                                    <input type="file" onChange={handleSourceUpload} accept=".xlsx, .xls, .csv" className="absolute inset-0 opacity-0 cursor-pointer" />
                                    <UploadCloud size={48} className="mx-auto mb-4 text-slate-300 group-hover:text-[#8e014d]" />
                                    <p className="text-lg font-black text-slate-600 uppercase">1. Quelldatei</p>
                                    {rawData.length > 0 && <p className="text-[#8e014d] font-bold mt-2">{rawData.length} Zeilen</p>}
                                </div>
                                <div className="bg-white border-4 border-dashed border-slate-200 p-10 rounded-[2rem] text-center hover:border-emerald-600 relative transition-all group">
                                    <input type="file" onChange={handleDbUpload} accept=".csv, .xlsx" className="absolute inset-0 opacity-0 cursor-pointer" />
                                    <Database size={48} className="mx-auto mb-4 text-slate-300 group-hover:text-emerald-600" />
                                    <p className="text-lg font-black text-slate-600 uppercase">2. Datenbank <span className="text-[10px] normal-case font-normal">(optional)</span></p>
                                    {dbData.length > 0 && <p className="text-emerald-600 font-bold mt-2">{dbData.length} Adressen</p>}
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
                                            <label className="text-[9px] font-black text-[#8e014d] uppercase tracking-tighter">KI-Modell</label>
                                            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="w-full bg-slate-800 border-none text-white text-[10px] p-4 rounded-xl outline-none focus:ring-2 ring-[#8e014d]">
                                                <option value="llama-3.3-70b-versatile">Llama 3.3 70B (empfohlen)</option>
                                                <option value="llama-3.1-8b-instant">Llama 3.1 8B (schnell, hohes Limit)</option>
                                                <option value="mixtral-8x7b-32768">Mixtral 8x7B (solide Alternative)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button onClick={prepareDbMatch} className="w-full bg-[#8e014d] py-5 rounded-2xl font-black text-xl hover:bg-[#b00260] transition-all flex justify-center items-center gap-3"><ListFilter fill="currentColor"/> DATENBANK ABGLEICHEN</button>
                                </div>
                            )}
                        </div>

                        {/* KLARES EINGABEFELD-DESIGN FÜR GEWICHTE */}
                        <div className="bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-sm">
                            <h3 className="text-[12px] font-black uppercase text-[#8e014d] mb-8 flex items-center gap-2"><Package size={16}/> Gewichte (g)</h3>
                            <div className="grid grid-cols-1 gap-6">
                                {Object.keys(weights).map(k => (
                                    <div key={k} className="pb-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{k}</label>
                                        <input 
                                            type="number" 
                                            value={weights[k]} 
                                            onChange={e => setWeights({...weights, [k]: parseInt(e.target.value)||0})} 
                                            className="w-full text-xl font-black text-slate-800 mt-2 bg-white border-2 border-slate-300 focus:border-[#8e014d] focus:ring-4 focus:ring-[#8e014d]/10 rounded-xl p-3 shadow-sm outline-none transition-all" 
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
                                <button onClick={runAiProcessing} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase shadow-lg hover:bg-[#8e014d] transition-all flex items-center gap-2">
                                    <Zap size={18} fill="currentColor"/> KI für {preMatchResults.unmatchedList.length} starten
                                </button>
                            )}
                        </div>

                        <div className="flex gap-4 mb-6 border-b-2 border-slate-200 pb-4">
                            <button onClick={() => setActiveTab('matched')} className={`px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 ${activeTab === 'matched' ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-200' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                                <CheckCircle size={16} /> Automatisch gematcht ({preMatchResults.matchedList.filter(m=>m.fromDB).length})
                            </button>
                            <button onClick={() => setActiveTab('unmatched')} className={`px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 ${activeTab === 'unmatched' ? 'bg-amber-100 text-amber-800 border-2 border-amber-200' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                                <AlertTriangle size={16} /> KI benötigt / Manuell ({preMatchResults.unmatchedList.length})
                            </button>
                        </div>

                        {/* --- TAB 1: ERWEITERTE MATCHED ANSICHT --- */}
                        {activeTab === 'matched' && (
                            <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 border-b-2 text-[10px] uppercase font-black text-slate-400">
                                        <tr><th className="p-5">Quelle (Excel)</th><th className="p-5">Gefunden in Datenbank</th><th className="p-5 text-right">Aktion</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {preMatchResults.matchedList.filter(m=>m.fromDB).map((r, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="p-5">
                                                    <div className="font-bold text-slate-800">{[r.anrede, r.titel, r.akad, r.vorname, r.nachname].filter(Boolean).join(' ')}</div>
                                                    <div className="text-[10px] text-slate-500 mt-1">{r.strasse}, {r.plz} {r.ort}</div>
                                                </td>
                                                <td className="p-5 font-bold text-emerald-900 bg-emerald-50/40">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Database size={12} className="text-emerald-500"/>
                                                        <span className="text-sm">{r.name}</span>
                                                    </div>
                                                    {r.zusatz && <div className="text-[10px] italic text-emerald-700 font-normal mb-2">↳ {r.zusatz}</div>}
                                                    <div className="grid grid-cols-2 gap-2 text-[10px] font-normal border-t border-emerald-100 pt-2">
                                                        <div><span className="text-emerald-400 uppercase font-black tracking-widest text-[8px] block">Straße</span>{r.type==='POBOX'?`Postfach ${r.nummer}`:`${r.strasse} ${r.nummer}`}</div>
                                                        <div><span className="text-emerald-400 uppercase font-black tracking-widest text-[8px] block">Ort</span>{r.plz} {r.ort}</div>
                                                    </div>
                                                    <div className="mt-3 inline-block bg-white border border-emerald-200 text-emerald-800 px-2 py-1 rounded text-[9px] font-black uppercase">
                                                        📦 {r.hQty}x Herold, {r.pQty}x Programm
                                                    </div>
                                                </td>
                                                <td className="p-5 text-right">
                                                    <button onClick={() => unmatchItem(r.id)} className="text-red-500 hover:text-white bg-red-50 hover:bg-red-500 p-2 rounded-xl transition-colors flex items-center gap-2 ml-auto text-[10px] font-bold uppercase border border-red-100">
                                                        <Unlink size={14}/> Trennen
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {preMatchResults.matchedList.filter(m=>m.fromDB).length === 0 && <tr><td colSpan="3" className="p-10 text-center text-slate-400 italic">Keine automatischen Treffer.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* --- TAB 2: UNMATCHED MIT EDIT-FUNKTION --- */}
                        {activeTab === 'unmatched' && (
                            <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 border-b-2 text-[10px] uppercase font-black text-slate-400">
                                        <tr><th className="p-5">Quelle (Excel)</th><th className="p-5">Status</th><th className="p-5 text-right">Aktion</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {preMatchResults.unmatchedList.map((r, i) => (
                                            <tr key={i} className={`hover:bg-slate-50 ${editingItemId === r.id ? 'bg-blue-50/50' : ''}`}>
                                                <td className="p-5">
                                                    {editingItemId === r.id ? (
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
                                                            <input type="text" placeholder="Anrede" value={editFormData.anrede} onChange={e=>setEditFormData({...editFormData, anrede: e.target.value})} className="border p-2 rounded text-xs"/>
                                                            <input type="text" placeholder="Titel" value={editFormData.titel} onChange={e=>setEditFormData({...editFormData, titel: e.target.value})} className="border p-2 rounded text-xs"/>
                                                            <input type="text" placeholder="Vorname" value={editFormData.vorname} onChange={e=>setEditFormData({...editFormData, vorname: e.target.value})} className="border p-2 rounded text-xs"/>
                                                            <input type="text" placeholder="Nachname" value={editFormData.nachname} onChange={e=>setEditFormData({...editFormData, nachname: e.target.value})} className="border p-2 rounded text-xs font-bold border-blue-400"/>
                                                            <input type="text" placeholder="Zusatz" value={editFormData.zusatz} onChange={e=>setEditFormData({...editFormData, zusatz: e.target.value})} className="border p-2 rounded text-xs col-span-2 md:col-span-4"/>
                                                            <input type="text" placeholder="Straße" value={editFormData.strasse} onChange={e=>setEditFormData({...editFormData, strasse: e.target.value})} className="border p-2 rounded text-xs col-span-2 md:col-span-2"/>
                                                            <input type="text" placeholder="PLZ" value={editFormData.plz} onChange={e=>setEditFormData({...editFormData, plz: e.target.value})} className="border p-2 rounded text-xs border-blue-400"/>
                                                            <input type="text" placeholder="Ort" value={editFormData.ort} onChange={e=>setEditFormData({...editFormData, ort: e.target.value})} className="border p-2 rounded text-xs"/>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="font-bold text-slate-800">
                                                                {[r.anrede, r.titel, r.akad, r.vorname, r.nachname].filter(Boolean).join(' ')} 
                                                                <span className="text-slate-400 italic font-normal ml-2">{r.zusatz}</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 font-normal uppercase mt-1">
                                                                {r.strasse}, <span className="font-bold text-[#8e014d]">{r.plz}</span> {r.ort}
                                                            </div>
                                                        </>
                                                    )}
                                                </td>
                                                <td className="p-5">
                                                    {editingItemId === r.id ? (
                                                        <span className="text-blue-600 font-bold text-[10px] uppercase">Bearbeitungsmodus</span>
                                                    ) : (
                                                        <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-200">Geht an KI</span>
                                                    )}
                                                </td>
                                                <td className="p-5 text-right">
                                                    {editingItemId === r.id ? (
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => setEditingItemId(null)} className="text-slate-500 hover:text-slate-700 bg-slate-100 p-2 rounded-lg font-bold"><X size={16}/></button>
                                                            <button onClick={saveEdit} className="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-[10px] uppercase flex items-center gap-2 shadow-md"><Save size={14}/> Speichern</button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => startEditing(r)} className="text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-2 rounded-lg transition-colors border border-slate-200 hover:border-blue-200" title="Adresse korrigieren">
                                                                <Edit3 size={14}/>
                                                            </button>
                                                            <button onClick={() => { setCurrentItemToMatch(r); setMatchModalOpen(true); }} className="text-slate-600 hover:text-[#8e014d] bg-slate-100 hover:bg-pink-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-[10px] font-bold uppercase border border-slate-200 hover:border-pink-200">
                                                                <Search size={14}/> DB Suchen
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* MODAL FÜR MANUELLE SUCHE */}
                {matchModalOpen && currentItemToMatch && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 animate-in fade-in">
                        <div className="bg-slate-100 rounded-[2rem] w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl border border-slate-300">
                            <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-center shrink-0">
                                <h3 className="text-2xl font-black uppercase italic text-slate-800">Manuelle Zuweisung</h3>
                                <button onClick={() => setMatchModalOpen(false)} className="text-slate-400 hover:text-slate-800 transition-colors"><XCircle size={28} /></button>
                            </div>
                            <div className="bg-slate-800 text-white p-6 shrink-0 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none"><Info size={120}/></div>
                                <h4 className="text-[9px] font-black uppercase text-emerald-400 mb-3 tracking-widest bg-emerald-900/40 inline-block px-3 py-1 rounded-md border border-emerald-800">Die rohe Quelle (Excel)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
                                    <div className="col-span-1 md:col-span-2">
                                        <span className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Name / Institution</span>
                                        <span className="font-bold text-base block">{[currentItemToMatch.anrede, currentItemToMatch.titel, currentItemToMatch.akad, currentItemToMatch.vorname, currentItemToMatch.nachname].filter(Boolean).join(' ')}</span>
                                        {currentItemToMatch.zusatz && <span className="text-sm italic text-slate-300 block mt-1">↳ {currentItemToMatch.zusatz}</span>}
                                    </div>
                                    <div>
                                        <span className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Eingetragene Adresse</span>
                                        <span className="font-semibold text-sm block">{currentItemToMatch.strasse || '-'}</span>
                                        <span className="text-xs text-slate-300 block mt-0.5"><span className="text-white font-bold">{currentItemToMatch.plz}</span> {currentItemToMatch.ort} ({currentItemToMatch.land || 'DEU'})</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Zap size={14} className="text-amber-500"/> KI-gestützte Vorschläge</h4>
                                        <div className="space-y-3">
                                            {getFuzzySuggestions(currentItemToMatch).map((suggestion, idx) => (
                                                <div key={idx} className="bg-white p-4 rounded-2xl border-2 border-emerald-100 hover:border-emerald-400 flex flex-col justify-between items-start transition-colors shadow-sm gap-3">
                                                    {renderDbCard(suggestion.dbRow, true)}
                                                    <button onClick={() => manualMatch(suggestion.dbRow)} className="w-full bg-emerald-100 text-emerald-800 hover:bg-emerald-500 hover:text-white py-3 rounded-xl font-bold uppercase text-[10px] flex justify-center items-center gap-2 transition-colors"><CheckSquare size={14}/> Diesen verwenden</button>
                                                </div>
                                            ))}
                                            {getFuzzySuggestions(currentItemToMatch).length === 0 && <p className="text-slate-400 italic text-sm p-4 bg-white rounded-2xl border border-dashed border-slate-200 text-center">Keine automatischen Vorschläge gefunden.</p>}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Search size={14} className="text-[#8e014d]"/> Datenbank durchsuchen</h4>
                                        <div className="relative mb-4">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input type="text" placeholder="Name, Straße oder PLZ tippen..." value={manualSearchQuery} onChange={e => setManualSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-slate-200 bg-white outline-none focus:border-[#8e014d] text-sm font-semibold shadow-inner" autoFocus />
                                        </div>
                                        <div className="space-y-3">
                                            {manualSearchResults.map((dbRow, idx) => (
                                                <div key={idx} className="bg-white p-4 rounded-2xl border-2 border-slate-200 hover:border-[#8e014d] flex flex-col justify-between items-start transition-colors shadow-sm gap-3">
                                                    {renderDbCard(dbRow, false)}
                                                    <button onClick={() => manualMatch(dbRow)} className="w-full bg-slate-100 text-slate-600 hover:bg-[#8e014d] hover:text-white py-3 rounded-xl font-bold uppercase text-[10px] flex justify-center items-center gap-2 transition-colors"><CheckSquare size={14}/> Zuweisen</button>
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
                            <h2 className="text-4xl font-black tracking-tighter uppercase italic">{isProcessing ? 'KI arbeitet...' : 'Vorschau'}</h2>
                            {!isProcessing && results && (
                                <div className="flex gap-4 items-center">
                                    <div className="relative w-64"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} /><input type="text" placeholder="Suchen..." className="w-full pl-10 pr-4 py-2 rounded-xl border-2 border-slate-200 outline-none focus:border-[#8e014d]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                                    <button onClick={() => setView('final')} className="bg-[#8e014d] text-white px-10 py-3 rounded-2xl font-black uppercase shadow-lg hover:scale-105 transition-all">Downloads</button>
                                </div>
                            )}
                        </div>
                        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-200 flex flex-wrap gap-10 items-center justify-between shadow-sm">
                            <div className="flex gap-10">
                                <div className="text-center"><p className="text-3xl font-black text-emerald-600">{procStats.db}</p><p className="text-[10px] font-bold uppercase text-slate-400">Aus Datenbank</p></div>
                                <div className="text-center"><p className="text-3xl font-black text-[#8e014d]">{procStats.ai}</p><p className="text-[10px] font-bold uppercase text-slate-400">Von KI geprüft</p></div>
                            </div>
                            {isProcessing && procStats.ai > 0 && (
                                <div className="flex-1 max-w-md ml-auto">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-2"><span className="flex items-center gap-1"><Loader2 className="animate-spin" size={12}/> KI arbeitet... ({selectedModel})</span><span className="text-[#8e014d]">{procStats.progress}%</span></div>
                                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5"><div className="bg-[#8e014d] h-full transition-all duration-500" style={{ width: `${procStats.progress}%` }}></div></div>
                                    <div className="text-right text-[10px] text-slate-500 font-bold">Restzeit: {formatETA(procStats.eta)}</div>
                                </div>
                            )}
                        </div>
                        {results && (
                            <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl mt-6">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 border-b-2 text-[10px] uppercase font-black text-slate-400">
                                        <tr><th className="p-5">Name (Z.1)</th><th className="p-5">Zusatz (Z.2)</th><th className="p-5">Adresse / Land</th><th className="p-5 text-right">Versand / Porto</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredPreview.map((r, i) => (
                                            <tr key={i} className={`${r.label === 'Kein Versand' ? 'bg-red-50 text-red-900 opacity-60' : r.errorMsg ? 'bg-amber-50' : ''}`}>
                                                <td className="p-5 font-bold">{r.fromDB && <Database size={10} className="inline text-emerald-500 mr-2" />}{r.name}</td>
                                                <td className="p-5 opacity-60 italic">{r.zusatz || '-'}</td>
                                                <td className="p-5"><div className="font-semibold">{r.type === 'POBOX' ? `Postfach ${r.nummer}` : `${r.strasse} ${r.nummer}`}</div><div className="text-[10px] uppercase mt-1">{r.plz} {r.ort} ({r.landCode})</div></td>
                                                <td className="p-5 text-right"><div className="font-black text-[#8e014d] uppercase tracking-tighter">{r.label}</div>{r.price > 0 && (<div className="text-[9px] font-bold text-slate-400 mt-1 uppercase">{r.hQty}xH, {r.pQty}xP | {r.totalWeight}g = {r.price.toFixed(2)} €</div>)}{r.errorMsg && <div className="text-[10px] font-bold text-red-500 mt-1">{r.errorMsg}</div>}</td>
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
                            <div className="relative z-10"><p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-80">Gesamte Portokosten</p><h2 className="text-8xl font-black mt-2 tracking-tighter italic">{results.totalCost.toFixed(2)} €</h2></div>
                            <div className="bg-white/10 p-10 rounded-[2.5rem] backdrop-blur-xl border border-white/20 text-center relative z-10"><p className="text-5xl font-black">{Object.values(results.groups).reduce((acc, arr) => acc + arr.length, 0)}</p><p className="text-[10px] font-black uppercase opacity-80 tracking-widest mt-2">Sendungen Gesamt</p></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {Object.entries(results.groups).map(([label, records]) => (
                                <div key={label} className="p-8 bg-white rounded-[3rem] border-2 flex flex-col justify-between hover:border-[#8e014d] transition-all shadow-sm">
                                    <div className="mb-6 text-center">
                                        <h4 className="text-lg font-black uppercase italic text-slate-800">{label}</h4>
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
        </div>
    );
}