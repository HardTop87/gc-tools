import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Settings2,
  Table2,
  Upload,
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  applyPaperPriceRows,
  buildPaperPriceCsv,
  buildPaperPriceRows,
  getDefaultPricingConfig,
  loadPricingConfig,
  parsePaperPriceCsv,
  resetPricingConfig,
  savePricingConfig,
  validatePricingConfig,
} from '../utils/pricingConfig';

const SETTINGS_META = [
  { key: 'baseGrundpreis1c', label: 'Klick-Grundpreis SW (1c)', einheit: '€', step: 0.001, hinweis: 'pro Seite SRA3' },
  { key: 'baseGrundpreis4c', label: 'Klick-Grundpreis Farbe (4c)', einheit: '€', step: 0.001, hinweis: 'pro Seite SRA3' },
  { key: 'dynFaktorBanner', label: 'Klick-Faktor Banner', einheit: '×', step: 0.1, hinweis: 'Multiplikator bei Banner-Formaten' },
  { key: 'celloGrundkosten', label: 'Cello Grundkosten', einheit: '€', step: 1, hinweis: 'einmalig pro Auftrag' },
  { key: 'celloFaktorBanner', label: 'Cello-Faktor Banner', einheit: '×', step: 0.1, hinweis: 'auf den Bogen-Stückpreis' },
  { key: 'setupKosten', label: 'Einrichtekosten', einheit: '€', step: 1, hinweis: 'einmalig pro Auftrag, jede Route' },
  { key: 'expressFaktor', label: 'Express-Aufschlag', einheit: 'Faktor', step: 0.01, hinweis: '0,1 = +10 % auf die Gesamtsumme' },
  { key: 'preferInternDelta', label: 'Empfehlung: GC bis +', einheit: '€', step: 1, hinweis: 'Toleranz GC vs. günstigster Partner' },
  { key: 'preferKoppDelta', label: 'Empfehlung: Kopp bis +', einheit: '€', step: 1, hinweis: 'Toleranz Kopp vs. ILDA' },
  { key: 'gcUmschlagGrundkosten', label: 'GC Umschlag-Zuschlag: Grundkosten', einheit: '€', step: 0.5, hinweis: 'Rillung/Umschlag Horizon' },
  { key: 'gcUmschlagStueckpreis', label: 'GC Umschlag-Zuschlag: pro Stück', einheit: '€', step: 0.01, hinweis: 'zusätzlich zu den Grundkosten' },
  { key: 'gcUmschlagAbAuflage', label: 'GC Umschlag-Zuschlag ab Auflage', einheit: 'Ex.', step: 1, hinweis: 'darunter kein Zuschlag' },
  { key: 'maxDickeGC', label: 'Max. Broschürendicke GC', einheit: 'µm', step: 50, hinweis: 'Basis der Seitenlimits (Horizon)' },
  { key: 'maxDickePartner', label: 'Max. Broschürendicke Partner', einheit: 'µm', step: 50, hinweis: 'Basis der Seitenlimits (Kopp/ILDA)' },
];

const WV_TABLE_LABELS = {
  gc_horizon: 'GC (Horizon)',
  kopp: 'Partner Kopp',
  ilda_mitUmschlag: 'ILDA — mit Umschlag',
  ilda_ohneUmschlag: 'ILDA — ohne Umschlag',
  ilda_banner_mit: 'ILDA Banner — mit Umschlag',
  ilda_banner_ohne: 'ILDA Banner — ohne Umschlag',
};

function fmtBogenpreis(preisPro1000) {
  return (preisPro1000 / 1000).toLocaleString('de-DE', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 5,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function inputClassName(extra = '') {
  return `h-9 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-sm text-slate-900 dark:text-gray-100 shadow-sm outline-none transition focus:border-[#8e014d] focus:ring-2 focus:ring-[#8e014d]/10 ${extra}`;
}

function panelClassName() {
  return 'rounded-3xl border border-slate-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur';
}

// Zahleneingabe mit lokalem Draft: übernimmt nur valide Zahlen in die Config,
// erlaubt aber Zwischenzustände beim Tippen ("0,").
function NumberField({ value, onCommit, step = 1, className = '', min }) {
  const [draft, setDraft] = useState(null);

  return (
    <input
      type="number"
      step={step}
      min={min}
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parseFloat(event.target.value);
        if (Number.isFinite(parsed)) onCommit(parsed);
      }}
      onBlur={() => setDraft(null)}
      className={inputClassName(className)}
    />
  );
}

function SectionHeader(props) {
  const { icon: Icon, title, subtitle, children } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-gray-700 px-6 py-5 sm:px-8">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-[#8e014d] p-2 text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-gray-400">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function ToolbarButton(props) {
  const { icon: Icon, label, onClick, tone = 'default' } = props;
  const toneClass =
    tone === 'danger'
      ? 'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl border bg-white px-3 text-xs font-semibold transition dark:bg-gray-900 ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default function Verwaltung() {
  const [config, setConfig] = useState(() => loadPricingConfig());
  const [wvTableKey, setWvTableKey] = useState('gc_horizon');
  const [pendingImport, setPendingImport] = useState(null);
  const [message, setMessage] = useState(null);
  const paperFileRef = useRef(null);
  const configFileRef = useRef(null);

  const isDefault = useMemo(
    () => JSON.stringify(config) === JSON.stringify(getDefaultPricingConfig()),
    [config],
  );

  function updateConfig(mutator) {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      mutator(next);
      next.meta.stand = todayIso();
      savePricingConfig(next);
      return next;
    });
  }

  function showMessage(type, text) {
    setMessage({ type, text });
  }

  function handleReset() {
    if (!window.confirm('Alle Anpassungen verwerfen und auf die im Repo hinterlegte Standard-Config zurücksetzen?')) {
      return;
    }
    const fresh = resetPricingConfig();
    setConfig(fresh);
    setPendingImport(null);
    showMessage('ok', 'Config auf Standard zurückgesetzt.');
  }

  function handleExportJson() {
    downloadBlob(
      `pricingConfig-${config.meta.stand ?? todayIso()}.json`,
      'application/json',
      JSON.stringify(config, null, 2),
    );
  }

  function handleExportCsv() {
    downloadBlob(`papierpreise-${todayIso()}.csv`, 'text/csv;charset=utf-8', buildPaperPriceCsv(config));
  }

  function handleExportXlsx() {
    const rows = buildPaperPriceRows(config);
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Papierpreise');
    XLSX.writeFile(workbook, `papierpreise-${todayIso()}.xlsx`);
  }

  function preparePaperImport(rows, parseErrors, sourceName) {
    if (parseErrors.length) {
      setPendingImport(null);
      showMessage('error', `Import "${sourceName}" abgelehnt:\n${parseErrors.join('\n')}`);
      return;
    }
    const { config: nextConfig, summary } = applyPaperPriceRows(config, rows);
    const validation = validatePricingConfig(nextConfig);
    if (!validation.ok) {
      setPendingImport(null);
      showMessage('error', `Import "${sourceName}" abgelehnt:\n${validation.errors.join('\n')}`);
      return;
    }
    setPendingImport({ kind: 'papierpreise', nextConfig, summary, sourceName });
    setMessage(null);
  }

  async function handlePaperFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const workbook = XLSX.read(await file.arrayBuffer());
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const rows = [];
        const errors = [];
        raw.forEach((row, i) => {
          const id = String(row.id ?? '').trim();
          const preis = typeof row.preis_pro_1000 === 'number'
            ? row.preis_pro_1000
            : parseFloat(String(row.preis_pro_1000).replace(',', '.'));
          if (!id) {
            errors.push(`Zeile ${i + 2}: id fehlt.`);
            return;
          }
          if (!(preis > 0)) {
            errors.push(`Zeile ${i + 2} (${id}): preis_pro_1000 muss eine Zahl > 0 sein.`);
            return;
          }
          const entry = { id, preis_pro_1000: preis };
          if (row.dicke_um !== '' && row.dicke_um !== undefined) {
            const dicke = typeof row.dicke_um === 'number'
              ? row.dicke_um
              : parseFloat(String(row.dicke_um).replace(',', '.'));
            if (!(dicke > 0)) {
              errors.push(`Zeile ${i + 2} (${id}): dicke_um muss eine Zahl > 0 sein.`);
              return;
            }
            entry.dicke_um = dicke;
          }
          rows.push(entry);
        });
        preparePaperImport(rows, errors, file.name);
      } else {
        const text = await file.text();
        const { rows, errors } = parsePaperPriceCsv(text);
        preparePaperImport(rows, errors, file.name);
      }
    } catch (error) {
      showMessage('error', `Datei konnte nicht gelesen werden: ${error.message}`);
    }
  }

  async function handleConfigFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const validation = validatePricingConfig(parsed);
      if (!validation.ok) {
        showMessage('error', `Config-Import abgelehnt:\n${validation.errors.join('\n')}`);
        return;
      }
      setPendingImport({ kind: 'config', nextConfig: parsed, sourceName: file.name });
      setMessage(null);
    } catch (error) {
      showMessage('error', `JSON konnte nicht gelesen werden: ${error.message}`);
    }
  }

  function applyPendingImport() {
    if (!pendingImport) return;
    savePricingConfig(pendingImport.nextConfig);
    setConfig(pendingImport.nextConfig);
    showMessage('ok', `Import "${pendingImport.sourceName}" übernommen.`);
    setPendingImport(null);
  }

  const wvTable = config.wvTabellen[wvTableKey];
  const wvRows = Object.keys(wvTable).map(Number).sort((a, b) => a - b);
  const wvCols = [...new Set(wvRows.flatMap((r) => Object.keys(wvTable[r]).map(Number)))].sort(
    (a, b) => a - b,
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="overflow-hidden rounded-[28px] border border-[#8e014d]/20 bg-[#8e014d] text-white shadow-[0_30px_80px_-30px_rgba(142,1,77,0.5)]">
          <div className="px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
            <div className="mb-5 flex items-center justify-between">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
              <ThemeToggle />
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Verwaltung — RST-Kalkulationsbasis
                </h1>
                <p className="mt-1 text-sm text-white/70">
                  Version {config.meta.version} · Stand {config.meta.stand}
                  {isDefault ? '' : ' · lokal angepasst'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  Config (JSON)
                </button>
                <button
                  type="button"
                  onClick={() => configFileRef.current?.click()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Config importieren
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Auf Standard zurücksetzen
                </button>
              </div>
            </div>
          </div>
        </header>

        <input ref={configFileRef} type="file" accept=".json" onChange={handleConfigFile} className="hidden" />
        <input
          ref={paperFileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handlePaperFile}
          className="hidden"
        />

        {message && (
          <div
            className={`whitespace-pre-wrap rounded-2xl border px-5 py-4 text-sm ${
              message.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {pendingImport && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-700 dark:bg-amber-950/40">
            <p className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              Import „{pendingImport.sourceName}“ prüfen und übernehmen
            </p>
            {pendingImport.kind === 'papierpreise' ? (
              <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                {pendingImport.summary.geaendert.length} Preise geändert
                {pendingImport.summary.geaendert.length > 0 &&
                  ` (${pendingImport.summary.geaendert.join(', ')})`}
                , {pendingImport.summary.unveraendert.length} unverändert
                {pendingImport.summary.unbekannt.length > 0 &&
                  `, ${pendingImport.summary.unbekannt.length} unbekannte ID übersprungen: ${pendingImport.summary.unbekannt.join(', ')}`}
                .
              </p>
            ) : (
              <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                Gesamt-Config Version {pendingImport.nextConfig.meta?.version} · Stand{' '}
                {pendingImport.nextConfig.meta?.stand} ersetzt die aktuelle Konfiguration.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={applyPendingImport}
                className="inline-flex h-9 items-center rounded-xl bg-[#8e014d] px-4 text-xs font-semibold text-white transition hover:bg-[#70013d]"
              >
                Übernehmen
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="inline-flex h-9 items-center rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Verwerfen
              </button>
            </div>
          </div>
        )}

        {/* Papierpreise */}
        <section className={panelClassName()}>
          <SectionHeader
            icon={Database}
            title="Papierpreise"
            subtitle="Pflege ausschließlich pro 1000 Bogen — der Bogenpreis wird berechnet"
          >
            <ToolbarButton icon={Download} label="CSV" onClick={handleExportCsv} />
            <ToolbarButton icon={FileSpreadsheet} label="XLSX" onClick={handleExportXlsx} />
            <ToolbarButton
              icon={Upload}
              label="CSV/XLSX importieren"
              onClick={() => paperFileRef.current?.click()}
            />
          </SectionHeader>

          <div className="overflow-x-auto px-6 py-4 sm:px-8">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Familie</th>
                  <th className="px-2 py-2 text-right">g/m²</th>
                  <th className="px-2 py-2 text-right">Dicke (µm)</th>
                  <th className="px-2 py-2 text-right">Preis / 1000 Bogen €</th>
                  <th className="px-2 py-2 text-right">Preis / Bogen €</th>
                </tr>
              </thead>
              <tbody>
                {config.papiere.map((paper, index) => (
                  <tr
                    key={paper.id}
                    className="border-t border-slate-100 dark:border-gray-800"
                  >
                    <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-gray-200">
                      {paper.name}
                      {paper.isPlaceholder && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                          title="Vorläufiger Wert — Preis/Name mit Guido klären"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Platzhalter
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-slate-500 dark:text-gray-400">{paper.familie}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500 dark:text-gray-400">{paper.gsm}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500 dark:text-gray-400">{paper.dickeUm}</td>
                    <td className="px-2 py-1.5 text-right">
                      <NumberField
                        value={paper.preisPro1000}
                        step={0.5}
                        min={0}
                        className="w-28 text-right"
                        onCommit={(value) =>
                          updateConfig((next) => {
                            next.papiere[index].preisPro1000 = value;
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-600 dark:text-gray-300">
                      {fmtBogenpreis(paper.preisPro1000)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Grundpreise & Faktoren */}
        <section className={panelClassName()}>
          <SectionHeader
            icon={Settings2}
            title="Grundpreise & Faktoren"
            subtitle="Wirken sofort auf die Kalkulation; Standardwerte stehen in der Repo-Config"
          />
          <div className="grid gap-x-8 gap-y-4 px-6 py-6 sm:px-8 md:grid-cols-2 xl:grid-cols-3">
            {SETTINGS_META.map((meta) => (
              <label key={meta.key} className="block space-y-1">
                <span className="flex items-baseline justify-between text-sm font-medium text-slate-700 dark:text-gray-300">
                  {meta.label}
                  <span className="text-xs text-slate-400 dark:text-gray-500">{meta.einheit}</span>
                </span>
                <NumberField
                  value={config.settings[meta.key]}
                  step={meta.step}
                  className="w-full"
                  onCommit={(value) =>
                    updateConfig((next) => {
                      next.settings[meta.key] = value;
                    })
                  }
                />
                <span className="block text-xs text-slate-400 dark:text-gray-500">{meta.hinweis}</span>
              </label>
            ))}
          </div>
        </section>

        {/* WV-Tabellen */}
        <section className={panelClassName()}>
          <SectionHeader
            icon={Table2}
            title="Verarbeitungspreis-Tabellen"
            subtitle="Zeile = Bogenteile, Spalte = Auflagenstaffel; zwischen Staffeln wird linear interpoliert"
          />
          <div className="px-6 py-4 sm:px-8">
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.keys(config.wvTabellen).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWvTableKey(key)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    key === wvTableKey
                      ? 'bg-[#8e014d] text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {WV_TABLE_LABELS[key] ?? key}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500">
                    <th className="px-2 py-2 text-left">BT \ Auflage</th>
                    {wvCols.map((col) => (
                      <th key={col} className="px-1 py-2 text-right">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wvRows.map((row) => (
                    <tr key={row} className="border-t border-slate-100 dark:border-gray-800">
                      <td className="px-2 py-1 font-semibold text-slate-700 dark:text-gray-300">{row}</td>
                      {wvCols.map((col) => {
                        const value = wvTable[row][col];
                        return (
                          <td key={col} className="px-1 py-1 text-right">
                            {value !== undefined ? (
                              <NumberField
                                value={value}
                                step={0.1}
                                min={0}
                                className="w-[4.5rem] px-1 text-right"
                                onCommit={(nextValue) =>
                                  updateConfig((next) => {
                                    next.wvTabellen[wvTableKey][row][col] = nextValue;
                                  })
                                }
                              />
                            ) : (
                              <span className="pr-2 text-slate-300 dark:text-gray-700">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-400 dark:text-gray-500">
              Strukturänderungen (neue Staffeln/Zeilen) über den JSON-Import der Gesamt-Config.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
