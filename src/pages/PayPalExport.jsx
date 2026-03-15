import { useState } from 'react';
import { ArrowLeft, UploadCloud, FileCheck, Download, AlertCircle, FileSpreadsheet, FileUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function PayPalExport() {
  const [isDragging, setIsDragging] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [error, setError] = useState(null);

  const processData = (data) => {
    const formatGermanNumber = (numStr) => {
      if (!numStr || numStr === "0") return "0";
      return numStr.toString().replace('.', ',');
    };

    const formatGermanDate = (dateStr) => {
      if (!dateStr) return "";
      if (dateStr.includes('.')) return dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
      return dateStr;
    };

    const grouped = data.reduce((acc, row) => {
      const rgNr = row['Rechnungsnummer'];
      const zahlart = row['Bezahlung'] || "";
      const istPayPal = zahlart.toLowerCase().includes('paypal');

      if (istPayPal && rgNr && !acc[rgNr]) {
        const mwstStr = row['MWST'] || "0";
        let mwstSatz = 0;
        let gegenkonto = "";

        if (mwstStr.includes("7")) {
          mwstSatz = 7;
          gegenkonto = "8305";
        } else if (mwstStr.includes("19")) {
          mwstSatz = 19;
          gegenkonto = "8405";
        }

        acc[rgNr] = {
          "Gesamt-Bruttowert": formatGermanNumber(row['Preis Gesamtpreis Brutto']),
          "Soll Haben": "S",
          "Gegenkonto": gegenkonto,
          "Rechnungsnummer": rgNr,
          "Rechnungsdatum": formatGermanDate(row['Rechnungsnummer-Datum']),
          "Kundennummer/-buchungskonto": "1260",
          "Vorname/Nachname": `${row['Rg. Vorname'] || ""} ${row['Rg. Nachname'] || ""}`.trim(),
          "Firmenname": row['Rg. Firma'] || "",
          "Ust-ID": row['RG. UmsatzsteuerID'] || "",
          "Bezahlung": zahlart,
          "Gutschein": "0",
          "Land": row['Rg. Land'] || "",
          "MwSt-Satz": mwstSatz,
          "Festschreibung": "0"
        };
      }
      return acc;
    }, {});

    let resultArr = Object.values(grouped);
    // Sortierung: Höchste Rechnungsnummer oben
    resultArr.sort((a, b) => (parseInt(b["Rechnungsnummer"]) || 0) - (parseInt(a["Rechnungsnummer"]) || 0));
    setProcessedData(resultArr);
  };

  const getRangeInfo = () => {
    if (!processedData || processedData.length === 0) return "";
    const nrs = processedData.map(d => parseInt(d["Rechnungsnummer"]) || 0);
    return `Rechnungen #${Math.min(...nrs)} bis #${Math.max(...nrs)}`;
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: ";",
      complete: (results) => processData(results.data),
      error: () => setError("Fehler beim Lesen der CSV-Datei.")
    });
  };

  const downloadCSV = () => {
    const csv = Papa.unparse(processedData, { quotes: true, delimiter: ";" });
    // Export ohne BOM für maximale Kompatibilität
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${new Date().toISOString().split('T')[0]}_PayPal-Export.csv`;
    link.click();
  };

  const downloadExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(processedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PayPal Export");
    XLSX.writeFile(workbook, `${new Date().toISOString().split('T')[0]}_PayPal-Export.xlsx`);
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <div className="mb-8">
        <Link to="/" className="text-[#8e014d] hover:text-[#c2185b] flex items-center text-xs font-black uppercase tracking-widest transition-all">
          <ArrowLeft size={16} className="mr-2" /> Dashboard
        </Link>
      </div>

      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10">
        <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">PayPal Export</h1>
            <p className="text-gray-400 text-sm">Automatische Gruppierung & Filterung</p>
          </div>
          <div className="w-10 h-10 flex items-center justify-center bg-[#fdf2f8] rounded-lg border border-[#8e014d]/10">
             <FileUp size={20} className="text-[#8e014d]" />
          </div>
        </div>

        {!processedData ? (
          <div 
            className="border-2 border-dashed border-gray-200 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer hover:bg-[#fdf2f8]/30 hover:border-[#8e014d]/20 transition-all duration-300"
            onClick={() => document.getElementById('fileInput').click()}
          >
            <input id="fileInput" type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            <div className="w-16 h-16 bg-[#fdf2f8] text-[#8e014d] rounded-full flex items-center justify-center mb-4 border border-[#8e014d]/5">
                <FileUp size={32} className="text-[#8e014d]" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Shop-CSV hochladen</h3>
            <p className="text-gray-400 mt-1 text-sm text-center">Datei hier hineinziehen oder klicken</p>
          </div>
        ) : (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#fdf2f8] border border-[#8e014d]/5 rounded-3xl p-8 flex flex-col xl:flex-row items-center justify-between gap-6 shadow-sm">
              <div className="flex items-center">
                <div className="w-14 h-14 bg-white text-[#8e014d] rounded-2xl shadow-sm flex items-center justify-center mr-5 border border-[#8e014d]/5 relative">
                    <FileCheck size={28} />
                </div>
                <div>
                  <p className="font-black text-gray-900 text-xl tracking-tight">{processedData.length} PayPal-Aufträge</p>
                  <p className="text-[#8e014d] font-bold text-xs bg-white px-2 py-1 rounded-md border border-[#8e014d]/10 mt-1 inline-block shadow-inner">
                    {getRangeInfo()}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 w-full xl:w-auto">
                <button onClick={() => setProcessedData(null)} className="flex-1 xl:flex-none px-6 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all text-gray-500">Neu</button>
                <button onClick={downloadCSV} className="flex-1 xl:flex-none px-6 py-3 bg-gray-900 text-white rounded-xl text-xs font-bold flex items-center justify-center hover:bg-black transition-all shadow-lg">
                  <Download size={18} className="mr-2" /> CSV
                </button>
                <button onClick={downloadExcel} className="flex-1 xl:flex-none px-6 py-3 bg-[#8e014d] text-white rounded-xl text-xs font-bold flex items-center justify-center hover:bg-[#70013d] transition-all shadow-lg">
                  <FileSpreadsheet size={18} className="mr-2" /> EXCEL
                </button>
              </div>
            </div>

            <div className="border border-gray-100 rounded-3xl overflow-hidden shadow-sm bg-white">
              <div className="bg-gray-50/50 px-6 py-3 border-b border-gray-100 flex justify-between items-center">
                <span className="text-[9px] font-black text-[#8e014d] uppercase tracking-[0.2em]">Datenvorschau (Neueste zuerst)</span>
              </div>
              <div className="overflow-x-auto max-h-[450px]">
                <table className="w-full text-[11px] text-left text-gray-500 border-collapse whitespace-nowrap">
                  <thead className="bg-white sticky top-0 border-b z-10 shadow-sm font-bold text-[#8e014d]/70 text-[9px] uppercase tracking-widest">
                    <tr>
                      {Object.keys(processedData[0]).map(h => (
                        <th key={h} className="px-6 py-4 bg-white">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {processedData.map((row, i) => (
                      <tr key={i} className="hover:bg-[#fdf2f8]/40 transition-colors">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className={`px-6 py-3 border-r border-gray-50 last:border-0 ${j === 3 ? 'font-black text-[#8e014d]' : ''}`}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}