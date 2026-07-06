import { useEffect, useMemo, useRef, useState } from 'react';
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
  clearPendingPublish,
  configRev,
  fetchSharedConfig,
  getDefaultPricingConfig,
  getPendingPublish,
  loadPricingConfigResult,
  normalizePaperPriceRows,
  parsePaperPriceCsv,
  saveSharedConfig,
  setPendingPublish,
  validatePricingConfig,
} from '../utils/pricingConfig';

// Optionale Anzeige-Metadaten je Setting; unbekannte Settings aus einer
// importierten Config werden trotzdem gerendert (Fallback: Key als Label).
const SETTINGS_META = {
  baseGrundpreis1c: { label: 'Klick-Grundpreis SW (1c)', einheit: '€', step: 0.001, hinweis: 'pro Seite SRA3' },
  baseGrundpreis4c: { label: 'Klick-Grundpreis Farbe (4c)', einheit: '€', step: 0.001, hinweis: 'pro Seite SRA3' },
  dynFaktorBanner: { label: 'Klick-Faktor Banner', einheit: '×', step: 0.1, hinweis: 'Multiplikator bei Banner-Formaten' },
  celloGrundkosten: { label: 'Cello Grundkosten', einheit: '€', step: 1, hinweis: 'einmalig pro Auftrag' },
  celloFaktorBanner: { label: 'Cello-Faktor Banner', einheit: '×', step: 0.1, hinweis: 'auf den Bogen-Stückpreis' },
  setupKosten: { label: 'Einrichtekosten', einheit: '€', step: 1, hinweis: 'einmalig pro Auftrag, jede Route' },
  expressFaktor: { label: 'Express-Aufschlag', einheit: 'Faktor', step: 0.01, hinweis: '0,1 = +10 % auf die Gesamtsumme' },
  preferInternDelta: { label: 'Empfehlung: GC bis +', einheit: '€', step: 1, hinweis: 'Toleranz GC vs. günstigster Partner' },
  preferKoppDelta: { label: 'Empfehlung: Kopp bis +', einheit: '€', step: 1, hinweis: 'Toleranz Kopp vs. ILDA' },
  gcUmschlagGrundkosten: { label: 'GC Umschlag-Zuschlag: Grundkosten', einheit: '€', step: 0.5, hinweis: 'Rillung/Umschlag Horizon' },
  gcUmschlagStueckpreis: { label: 'GC Umschlag-Zuschlag: pro Stück', einheit: '€', step: 0.01, hinweis: 'zusätzlich zu den Grundkosten' },
  gcUmschlagAbAuflage: { label: 'GC Umschlag-Zuschlag ab Auflage', einheit: 'Ex.', step: 1, min: 1, hinweis: 'darunter kein Zuschlag' },
  maxDickeGC: { label: 'Max. Broschürendicke GC', einheit: 'µm', step: 50, min: 1, hinweis: 'Basis der Seitenlimits (Horizon)' },
  maxDickePartner: { label: 'Max. Broschürendicke Partner', einheit: 'µm', step: 50, min: 1, hinweis: 'Basis der Seitenlimits (Kopp/ILDA)' },
};

const WV_VARIANT_LABELS = {
  standard_mit: 'mit Umschlag',
  standard_ohne: 'ohne Umschlag',
  banner_mit: 'Banner, mit Umschlag',
  banner_ohne: 'Banner, ohne Umschlag',
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

// Zahleneingabe mit lokalem Draft: committet erst bei Blur/Enter (nicht pro
// Tastendruck) und nur Werte ≥ min — Zwischenzustände wie "0" auf dem Weg zu
// "0,5" erreichen die Config nie. Ungültige Eingaben fallen auf den alten Wert zurück.
function NumberField({ value, onCommit, step = 1, className = '', min }) {
  const [draft, setDraft] = useState(null);

  function commit() {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(parsed) && (min === undefined || parsed >= min) && parsed !== value) {
      onCommit(parsed);
    }
  }

  return (
    <input
      type="number"
      step={step}
      min={min}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
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
    tone === 'inverted'
      ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default function Verwaltung() {
  // Startwert aus Offline-Cache/Default; der geteilte Stand wird sofort nachgeladen.
  const [config, setConfig] = useState(() => loadPricingConfigResult().config);
  const [wvTableKey, setWvTableKey] = useState('gc_horizon');
  const [pendingImport, setPendingImport] = useState(null);
  const [message, setMessage] = useState(null);
  const [sharedStatus, setSharedStatus] = useState({ state: 'loading' });
  const [publishState, setPublishState] = useState({ status: 'idle' });
  const paperFileRef = useRef(null);
  const configFileRef = useRef(null);

  // Publish-Pipeline: debounced + serialisiert (nie zwei POSTs gleichzeitig),
  // mit Revision als Basis für die Konfliktprüfung des Servers.
  const loadedRevRef = useRef(0);
  const publishTimerRef = useRef(null);
  const inFlightRef = useRef(false);
  const pendingConfigRef = useRef(null);
  const savedResetRef = useRef(null);

  const defaultVersion = useMemo(() => getDefaultPricingConfig().meta.version, []);
  const hasNewerDefault = config.meta.version !== defaultVersion;

  // Geteilten Preisstand beim Öffnen laden; danach eine ggf. noch nicht
  // veröffentlichte Änderung aus einer früheren Sitzung erneut anstoßen.
  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await fetchSharedConfig();
      if (!alive) return;
      if (result.config) {
        loadedRevRef.current = configRev(result.config);
        setConfig(result.config);
        setSharedStatus({ state: 'shared' });
      } else if (result.source === 'none') {
        loadedRevRef.current = 0;
        setSharedStatus({ state: 'none' });
      } else if (result.source === 'invalid') {
        setSharedStatus({ state: 'invalid' });
        showMessage(
          'error',
          `Der geteilte Preisstand ist ungültig und wird nicht verwendet:\n${result.errors.join('\n')}`,
        );
      } else {
        setSharedStatus({ state: 'offline' });
      }

      const pending = getPendingPublish();
      if (alive && pending) {
        setConfig(pending);
        showMessage('ok', 'Eine noch nicht veröffentlichte Änderung wird erneut veröffentlicht.');
        schedulePublish(pending, 0);
      }
    })();
    return () => {
      alive = false;
      if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tabellen-Labels aus den Routen ableiten, die sie referenzieren —
  // per Config ergänzte Tabellen bekommen so automatisch sinnvolle Namen.
  const wvTableLabels = useMemo(() => {
    const labels = {};
    for (const route of config.routen) {
      const ref = route.wvTabelleRef;
      if (typeof ref === 'string') {
        labels[ref] ??= route.name;
      } else {
        for (const [variantKey, tableName] of Object.entries(ref ?? {})) {
          labels[tableName] ??= `${route.name} — ${WV_VARIANT_LABELS[variantKey] ?? variantKey}`;
        }
      }
    }
    return labels;
  }, [config.routen]);

  function showMessage(type, text) {
    setMessage({ type, text });
  }

  // Plant eine Veröffentlichung (debounced). Die zu veröffentlichende Config
  // wird zusätzlich als "pending" persistiert, damit sie bei Navigieren/Offline
  // nicht verloren geht.
  function schedulePublish(nextConfig, delay = 900) {
    pendingConfigRef.current = nextConfig;
    setPendingPublish(nextConfig);
    setPublishState({ status: 'saving' });
    if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
    publishTimerRef.current = setTimeout(runPublish, delay);
  }

  async function runPublish() {
    if (inFlightRef.current) return; // nach Abschluss wird erneut geprüft
    const toPublish = pendingConfigRef.current;
    if (!toPublish) return;
    pendingConfigRef.current = null;
    inFlightRef.current = true;

    const result = await saveSharedConfig(toPublish, loadedRevRef.current);
    inFlightRef.current = false;

    if (result.ok) {
      loadedRevRef.current = result.rev;
      clearPendingPublish();
      setSharedStatus({ state: 'shared' });
      setPublishState({ status: 'saved' });
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
      savedResetRef.current = setTimeout(
        () => setPublishState((prev) => (prev.status === 'saved' ? { status: 'idle' } : prev)),
        4000,
      );
    } else if (result.conflict) {
      // Jemand anderes hat zwischenzeitlich veröffentlicht → aktuellen Stand
      // laden, damit man darauf weiterarbeitet; die eigene Änderung wurde NICHT
      // übernommen und muss erneut vorgenommen werden.
      clearPendingPublish();
      setPublishState({ status: 'idle' });
      const fresh = await fetchSharedConfig();
      if (fresh.config) {
        loadedRevRef.current = configRev(fresh.config);
        setConfig(fresh.config);
      }
      showMessage(
        'error',
        'Zwischenzeitlich hat jemand anderes gespeichert — deine letzte Änderung wurde NICHT ' +
          'übernommen. Der aktuelle Stand wurde geladen; bitte die Änderung erneut vornehmen.',
      );
    } else if (result.offline) {
      setPublishState({ status: 'offline' });
      showMessage(
        'error',
        'Der geteilte Speicher ist gerade nicht erreichbar. Die Änderung ist lokal gemerkt und ' +
          'wird beim nächsten Öffnen erneut veröffentlicht.',
      );
    } else {
      setPublishState({ status: 'error' });
      clearPendingPublish();
      showMessage('error', `Veröffentlichen abgelehnt:\n${result.errors.join('\n')}`);
    }

    // Kamen während des Publish weitere Änderungen? Dann erneut anstoßen.
    if (pendingConfigRef.current) {
      if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
      publishTimerRef.current = setTimeout(runPublish, 300);
    }
  }

  // Übernimmt eine Änderung: sofort im UI (State), persistiert als "pending",
  // und stößt die Veröffentlichung an. Der lokale Cache (= letzter geteilter
  // Stand) wird bewusst NICHT hier geschrieben, sondern erst bei Publish-Erfolg.
  function applyChange(nextConfig) {
    setConfig(nextConfig);
    schedulePublish(nextConfig);
  }

  function updateConfig(mutator) {
    const next = JSON.parse(JSON.stringify(config));
    mutator(next);
    next.meta.stand = todayIso();
    const validation = validatePricingConfig(next);
    if (!validation.ok) {
      showMessage('error', `Änderung verworfen — die Config wäre ungültig:\n${validation.errors.join('\n')}`);
      return;
    }
    applyChange(next);
  }

  function handleReset() {
    if (!window.confirm('Den geteilten Preisstand für ALLE auf den Repo-Standard zurücksetzen?')) {
      return;
    }
    const fresh = getDefaultPricingConfig();
    fresh.meta.stand = todayIso();
    setPendingImport(null);
    showMessage('ok', 'Auf Standard zurückgesetzt — wird veröffentlicht.');
    applyChange(fresh);
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
        // gleiche Zeilenprüfung wie beim CSV-Import (normalizePaperPriceRows)
        const lowercased = raw.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value]),
          ),
        );
        const { rows, errors } = normalizePaperPriceRows(lowercased);
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
    const next = { ...pendingImport.nextConfig, meta: { ...pendingImport.nextConfig.meta, stand: todayIso() } };
    showMessage('ok', `Import "${pendingImport.sourceName}" übernommen — wird veröffentlicht.`);
    applyChange(next);
    setPendingImport(null);
  }

  // Ausgewählten Tab gegen die (ggf. importierte) Config abgleichen —
  // fehlt der Key, fällt die Anzeige auf die erste vorhandene Tabelle zurück.
  const wvTableKeys = Object.keys(config.wvTabellen ?? {});
  const effectiveWvKey = wvTableKeys.includes(wvTableKey) ? wvTableKey : wvTableKeys[0];
  const wvTable = effectiveWvKey ? config.wvTabellen[effectiveWvKey] : {};
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
                  {sharedStatus.state === 'shared' && ' · geteilter Stand'}
                  {sharedStatus.state === 'none' && ' · noch nicht veröffentlicht'}
                  {sharedStatus.state === 'offline' && ' · geteilter Speicher offline'}
                  {publishState.status === 'saving' && ' · speichere …'}
                  {publishState.status === 'saved' && ' · ✓ für alle gespeichert'}
                  {publishState.status === 'offline' && ' · ⚠ nicht veröffentlicht (offline)'}
                  {publishState.status === 'error' && ' · ⚠ nicht veröffentlicht'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolbarButton icon={Download} label="Config (JSON)" onClick={handleExportJson} tone="inverted" />
                <ToolbarButton
                  icon={Upload}
                  label="Config importieren"
                  onClick={() => configFileRef.current?.click()}
                  tone="inverted"
                />
                <ToolbarButton icon={RotateCcw} label="Auf Standard zurücksetzen" onClick={handleReset} tone="inverted" />
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

        {sharedStatus.state === 'none' && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
            Es ist noch kein geteilter Preisstand veröffentlicht. Sobald du etwas änderst, eine
            Preisliste importierst oder „Auf Standard zurücksetzen“ klickst, wird der Stand für alle
            angelegt und ist überall sichtbar.
          </div>
        )}

        {hasNewerDefault && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
            Der im Repo hinterlegte Standard hat Version {defaultVersion}, der aktuelle Stand basiert
            auf {config.meta.version}. „Auf Standard zurücksetzen“ veröffentlicht den neuen Standard
            für alle — vorher bei Bedarf die aktuelle Config als JSON exportieren.
          </div>
        )}

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
                        min={0.001}
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
            {Object.keys(config.settings).map((key) => {
              const meta = SETTINGS_META[key] ?? {};
              return (
                <label key={key} className="block space-y-1">
                  <span className="flex items-baseline justify-between text-sm font-medium text-slate-700 dark:text-gray-300">
                    {meta.label ?? key}
                    <span className="text-xs text-slate-400 dark:text-gray-500">{meta.einheit ?? ''}</span>
                  </span>
                  <NumberField
                    value={config.settings[key]}
                    step={meta.step ?? 0.01}
                    min={meta.min ?? 0}
                    className="w-full"
                    onCommit={(value) =>
                      updateConfig((next) => {
                        next.settings[key] = value;
                      })
                    }
                  />
                  <span className="block text-xs text-slate-400 dark:text-gray-500">{meta.hinweis ?? ''}</span>
                </label>
              );
            })}
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
              {wvTableKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWvTableKey(key)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    key === effectiveWvKey
                      ? 'bg-[#8e014d] text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {wvTableLabels[key] ?? key}
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
                                min={0.001}
                                className="w-[4.5rem] px-1 text-right"
                                onCommit={(nextValue) =>
                                  updateConfig((next) => {
                                    next.wvTabellen[effectiveWvKey][row][col] = nextValue;
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
