import React, { useState, useMemo } from 'react';
import { 
    Download, UploadCloud, AlertTriangle, 
    Search, XCircle, FileText, Package, Truck
} from 'lucide-react';
import * as XLSX from 'xlsx';

// --- KONFIGURATION ---
const SENDER_ROW = "Guido Coenen;GC Digitaldruck;Landsberger Str.;318a;80687;München;DEU;HOUSE";
const INITIAL_WEIGHTS = { heroldNetto: 170, heroldBrutto: 200, programmBrutto: 18 };

const ACADEMIC_BLACKLIST = [
    /Master\s?of\s?\w+/i, /M\.?\s?Sc\.?/i, /M\.?\s?A\.?/i, /B\.?\s?Sc\.?/i, /Bachelor/i,
    /Diplom-?\w+/i, /Dipl\.-?\w+/i, /Staatsexamen/i, /Volljurist/i, /Jurist/i,
    /Facharzt\s?f\.?\s?\w+/i, /Oberarzt/i, /Lehramt/i, /Sonderschullehrer/i,
    /Apotheker/i, /Rechtsanwalt/i, /Studienrat/i, /StR/i, /OStD/i, /Gymnasiallehrer/i,
    /et\s?habil\.?/i, /habil\.?/i, /i\.R\.?/i, /a\.D\.?/i, /univ\.?/i, /Scientiae/i,
    /Engineering/i, /Management/i, /Physiker/i, /Informatiker/i, /Wirtschaftsingenieur/i,
    /Politologe/i, /Verwaltungswirt/i, /Magister/i
];

const INSTITUTION_KEYWORDS = [
    'bibliothek', 'archiv', 'erzdiözese', 'amt', 'stelle', 'uni', 
    'verwaltung', 'stadtbibliothek', 'abteilung', 'staatsarchiv', 'hauptstaatsarchiv'
];

// --- HELFER ---
function cleanNameField(text) {
    let cleaned = String(text || '');
    ACADEMIC_BLACKLIST.forEach(regex => { cleaned = cleaned.replace(regex, ''); });
    // Entfernt überflüssige Sonderzeichen und Mehrfach-Leerzeichen
    return cleaned.replace(/,/g, ' ').replace(/\s\s+/g, ' ').trim();
}

function parseStreetAndNumber(rawStreet) {
    const s = String(rawStreet || '').trim();
    const pfMatch = s.match(/postfach\s*([^\s,;]+)/i);
    if (pfMatch) {
        const pureNumbers = pfMatch[1].replace(/\D/g, '');
        return { street: "", number: pureNumbers, type: "POBOX" };
    }
    const match = s.match(/^(.*?)\s*(\d+[a-zA-Z]*(-?\d*[a-zA-Z]*)?)$/);
    if (match) return { street: match[1].trim(), number: match[2].trim(), type: "HOUSE" };
    return { street: s, number: "0", type: "HOUSE" };
}

export default function PostVersandManager() {
    const [weights, setWeights] = useState(INITIAL_WEIGHTS);
    const [rawData, setRawData] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [mapping, setMapping] = useState({});
    const [results, setResults] = useState(null);
    const [view, setView] = useState('upload');
    const [searchTerm, setSearchTerm] = useState('');

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
            
            const hIdx = data.findIndex(r => r && r.some(c => {
                const s = String(c || '').toLowerCase();
                return s.includes('nachname') || s.includes('plz') || s.includes('anrede');
            }));

            if (hIdx === -1) return alert("Konnte keine Kopfzeile finden!");
            
            const currentHeaders = data[hIdx].map(h => String(h || '').trim());
            setHeaders(currentHeaders);
            setRawData(XLSX.utils.sheet_to_json(ws, { range: hIdx }));
            
            const findColumn = (keys) => {
                const idx = currentHeaders.findIndex(h => {
                    const headerStr = String(h || '').toLowerCase();
                    return keys.some(k => headerStr.includes(k));
                });
                return idx !== -1 ? currentHeaders[idx] : '';
            };
            
            setMapping({
                anrede: findColumn(['anrede']), titel: findColumn(['titel']), 
                akad: findColumn(['akademischer']), vorname: findColumn(['vorname']), 
                nachname: findColumn(['nachname']), zusatz: findColumn(['zusatz']),
                strasse: findColumn(['straße', 'adresse']), plz: findColumn(['plz']), 
                ort: findColumn(['ort', 'stadt']), land: findColumn(['land']), 
                herold: findColumn(['herold post']), programm: findColumn(['semesterprogramm'])
            });
        };
        reader.readAsArrayBuffer(file);
    };

    const runProcessing = () => {
        const groups = {};
        const preview = [];
        let totalCost = 0;

        rawData.forEach((row) => {
            const hQty = parseInt(row[mapping.herold]) || 0;
            const pQty = parseInt(row[mapping.programm]) || 0;
            if (hQty === 0 && pQty === 0) return;

            const anrede = String(row[mapping.anrede] || '').trim();
            const nachname = String(row[mapping.nachname] || '').trim();
            const vorname = String(row[mapping.vorname] || '').trim();
            const zusatzCol = String(row[mapping.zusatz] || '').trim();

            let fName, fZusatz;
            // Prüfung: Ist es eine Institution?
            const isInst = INSTITUTION_KEYWORDS.some(k => 
                (anrede + " " + nachname + " " + zusatzCol).toLowerCase().includes(k)
            );

            if (isInst) {
                // LOGIK FÜR INSTITUTIONEN:
                // Zeile 1: Anrede + Nachname (z.B. "An die Staatliche Bibliothek...")
                fName = cleanNameField(`${anrede} ${nachname}`);
                // Zeile 2: Vorname (Ansprechpartner) + Zusatz (Abteilung)
                fZusatz = cleanNameField(`${vorname} ${zusatzCol}`);
            } else {
                // LOGIK FÜR PRIVATPERSONEN:
                // Alles in Zeile 1, Zeile 2 bleibt leer
                fName = cleanNameField(`${anrede} ${vorname} ${String(row[mapping.titel]||'')} ${String(row[mapping.akad]||'')} ${nachname}`);
                fZusatz = "";
            }

            const addr = parseStreetAndNumber(row[mapping.strasse]);
            const plzRaw = String(row[mapping.plz] || '').trim();
            const land = String(row[mapping.land] || 'DEU').toUpperCase();
            
            const weight = (hQty * weights.heroldNetto) + (hQty > 0 ? (weights.heroldBrutto - weights.heroldNetto) : 0) + (pQty * weights.programmBrutto);
            
            const config = (land === 'DEU' || land === 'DE') ? 
                [{ m: 20, p: 0.95, l: 'Standard' }, { m: 50, p: 1.1, l: 'Kompakt' }, { m: 500, p: 1.8, l: 'Großbrief' }, { m: 1000, p: 2.9, l: 'Maxibrief' }] :
                [{ m: 20, p: 1.25, l: 'St. Int' }, { m: 50, p: 1.8, l: 'Ko. Int' }, { m: 500, p: 3.3, l: 'Gr. Int' }, { m: 1000, p: 6.5, l: 'Ma. Int' }];
            
            const postage = config.find(c => weight <= c.m);

            let errors = [];
            let warnings = [];
            let isDHL = weight > 1000;
            
            if (!plzRaw) errors.push("PLZ fehlt");
            if (isDHL) errors.push(`GEWICHT ZU HOCH (${weight}g): Nur DHL`);
            if (fName.length > 45) warnings.push("Name sehr lang");

            const record = {
                name: fName, zusatz: fZusatz, street: addr.street, number: addr.number,
                plz: plzRaw.length === 4 && (land === 'DEU' || land === 'DE') ? '0' + plzRaw : plzRaw, 
                ort: String(row[mapping.ort] || ''),
                land: land.includes('DE') ? 'DEU' : land, 
                weight, type: addr.type,
                label: isDHL ? 'DHL Paket' : (postage ? postage.l : 'Manuell'), 
                price: isDHL ? 0 : (postage ? postage.p : 0),
                isDHL,
                errorMsg: errors.join(" | "),
                warningMsg: warnings.join(" | ")
            };

            const groupName = record.label;
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(record);
            if (!isDHL) totalCost += record.price;
            preview.push(record);
        });

        setResults({ groups, totalCost, preview });
        setView('preview');
    };

    const downloadCSV = (label, records) => {
        const limit = label.includes('DHL') ? 9999 : 99;
        for (let i = 0; i < records.length; i += limit) {
            const batch = records.slice(i, i + limit);
            const content = [
                "NAME;ZUSATZ;STRASSE;NUMMER;PLZ;STADT;LAND;ADRESS_TYP",
                SENDER_ROW,
                ...batch.map(r => `"${r.name}";"${r.zusatz}";"${r.street}";"${r.number}";"${r.plz}";"${r.ort}";"${r.land}";"${r.type}"`)
            ].join('\r\n');
            const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${label.replace(/\s/g, '_')}_Batch_${(i/limit)+1}.csv`;
            a.click();
        }
    };

    const filteredPreview = useMemo(() => {
        if (!results) return [];
        return results.preview.filter(r => 
            r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            r.plz.includes(searchTerm)
        );
    }, [results, searchTerm]);

    return (
        <div className="min-h-screen bg-slate-100 p-6 md:p-12 font-sans text-slate-900 text-xs">
            <header className="max-w-7xl mx-auto flex justify-between items-center mb-10">
                <div className="flex items-center gap-3">
                    <div className="bg-[#8e014d] p-3 rounded-2xl shadow-lg text-white">
                        <FileText size={24} />
                    </div>
                    <h1 className="text-xl font-black italic uppercase tracking-tighter">
                        Rhaetia <span className="text-[#8e014d] not-italic text-sm">Post-Manager</span>
                    </h1>
                </div>
                {view !== 'upload' && (
                    <button onClick={() => setView('upload')} className="bg-white border-2 border-slate-200 px-6 py-2 rounded-xl font-bold hover:bg-slate-50 transition-all uppercase text-[10px] tracking-widest">
                        Neue Datei
                    </button>
                )}
            </header>

            <main className="max-w-7xl mx-auto">
                {view === 'upload' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                        <div className="lg:col-span-2 space-y-8">
                            <div className="bg-white border-4 border-dashed border-slate-200 p-20 rounded-[3rem] text-center hover:border-[#8e014d] relative transition-all group shadow-inner">
                                <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                <UploadCloud size={64} className="mx-auto mb-4 text-slate-300 group-hover:text-[#8e014d]" />
                                <p className="text-2xl font-black text-slate-400 uppercase tracking-widest">Excel-Liste wählen</p>
                            </div>

                            {headers.length > 0 && (
                                <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-10">
                                        {Object.keys(mapping).map(k => (
                                            <div key={k} className="flex flex-col gap-1">
                                                <label className="text-[9px] font-black text-[#8e014d] uppercase tracking-tighter">{k}</label>
                                                <select value={mapping[k]} onChange={e => setMapping({...mapping, [k]: e.target.value})} className="bg-slate-800 border-none text-white text-[10px] rounded-lg p-2 outline-none focus:ring-2 ring-[#8e014d]">
                                                    <option value="">- ignorieren -</option>
                                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={runProcessing} className="w-full bg-[#8e014d] py-5 rounded-2xl font-black text-xl hover:bg-[#b00260] transition-all">
                                        LISTEN GENERIEREN
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest flex items-center gap-2"><Package size={14}/> Gewichte (g)</h3>
                            {Object.keys(weights).map(k => (
                                <div key={k} className="mb-6 border-b border-slate-50 pb-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">{k}</label>
                                    <input type="number" value={weights[k]} onChange={e => setWeights({...weights, [k]: parseInt(e.target.value) || 0})} className="w-full text-2xl font-black text-slate-800 outline-none" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {view === 'preview' && results && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                            <div>
                                <h2 className="text-4xl font-black tracking-tighter text-slate-800 uppercase italic">Vorschau</h2>
                                <p className="text-slate-500 font-bold ml-1 italic">{results.preview.length} Datensätze</p>
                            </div>
                            <div className="flex gap-4 w-full md:w-auto">
                                <div className="relative flex-1 md:w-72">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input type="text" placeholder="Suchen..." className="w-full pl-12 pr-4 py-3 rounded-2xl border-2 border-slate-200 bg-white outline-none focus:border-[#8e014d]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                </div>
                                <button onClick={() => setView('final')} className="bg-[#8e014d] text-white px-10 py-4 rounded-2xl font-black shadow-lg hover:scale-105 transition-all uppercase tracking-tight">
                                    Downloads anzeigen
                                </button>
                            </div>
                        </div>

                        <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b-2 border-slate-100 text-[10px] uppercase font-black text-slate-400">
                                    <tr>
                                        <th className="p-5">Name (Z.1)</th>
                                        <th className="p-5">Zusatz (Z.2)</th>
                                        <th className="p-5">Adresse</th>
                                        <th className="p-5">PLZ / Ort</th>
                                        <th className="p-5 text-right">Info</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredPreview.map((r, i) => (
                                        <tr key={i} className={`
                                            ${r.isDHL ? 'bg-purple-100 text-purple-950 font-bold' : r.errorMsg ? 'bg-red-300 text-red-950 font-bold' : r.warningMsg ? 'bg-amber-100' : 'hover:bg-slate-50'} 
                                            transition-colors group
                                        `}>
                                            <td className="p-5">
                                                <div className="flex items-center gap-3">
                                                    {(r.errorMsg || r.isDHL) && (
                                                        <div className="relative group/tip cursor-help">
                                                            {r.isDHL ? <Truck size={16} className="text-purple-700" /> : <XCircle size={16} className="text-red-700" />}
                                                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tip:block bg-slate-900 text-white text-[10px] p-2 rounded shadow-xl whitespace-nowrap z-50">
                                                                {r.errorMsg}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {r.warningMsg && !r.errorMsg && !r.isDHL && (
                                                        <div className="relative group/tip cursor-help">
                                                            <AlertTriangle size={16} className="text-amber-600" />
                                                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tip:block bg-amber-800 text-white text-[10px] p-2 rounded shadow-xl whitespace-nowrap z-50">
                                                                {r.warningMsg}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <span className="tracking-tight">{r.name}</span>
                                                </div>
                                            </td>
                                            <td className="p-5 opacity-60 italic">{r.zusatz || '-'}</td>
                                            <td className="p-5 font-semibold">
                                                {r.type === 'POBOX' ? `Postfach ${r.number}` : `${r.street} ${r.number}`}
                                            </td>
                                            <td className="p-5 font-semibold">{r.plz} {r.ort}</td>
                                            <td className="p-5 text-right font-black uppercase text-[10px]">
                                                {r.label} <span className="ml-2 opacity-30">({r.weight}g)</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {view === 'final' && results && (
                    <div className="space-y-10 animate-in zoom-in-95">
                        <div className="bg-[#8e014d] p-16 rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
                            <div className="relative z-10 text-center md:text-left">
                                <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-60">Portokosten (Briefe)</p>
                                <h2 className="text-8xl font-black mt-2 tracking-tighter italic">{results.totalCost.toFixed(2)} €</h2>
                            </div>
                            <div className="bg-white/10 p-10 rounded-[2.5rem] backdrop-blur-xl border border-white/20 text-center relative z-10">
                                <p className="text-5xl font-black">{results.preview.length}</p>
                                <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mt-2">Gesamtzahl</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 text-center">
                            {Object.entries(results.groups).map(([label, records]) => (
                                <div key={label} className={`p-10 rounded-[3rem] border-2 flex flex-col justify-between group transition-all shadow-sm
                                    ${label.includes('DHL') ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-100 hover:border-[#8e014d]'}
                                `}>
                                    <div className="mb-8">
                                        <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase italic">{label}</h4>
                                        <p className={`font-bold mt-1 uppercase text-[10px] tracking-[0.2em] ${label.includes('DHL') ? 'text-purple-600' : 'text-[#8e014d]'}`}>
                                            {records.length} Sendungen
                                        </p>
                                    </div>
                                    <button onClick={() => downloadCSV(label, records)} className={`w-full py-5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all shadow-xl active:scale-95
                                        ${label.includes('DHL') ? 'bg-purple-900 text-white hover:bg-purple-800' : 'bg-slate-900 text-white hover:bg-[#8e014d]'}
                                    `}>
                                        <Download size={22}/> CSV DOWNLOAD
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