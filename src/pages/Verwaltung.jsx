import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { PageHeader, SecondaryButton } from '../components/PageHeader';
import {
  applyPaperPriceRows,
  buildPaperPriceCsv,
  buildPaperPriceRows,
  canAutoPublishPending,
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
  gcDickenAufschlagAbMm: { label: 'GC Dickenaufschlag ab Buchdicke', einheit: 'mm', step: 0.05, hinweis: 'darunter kein Aufschlag' },
  gcDickenAufschlagAbAuflage: { label: 'GC Dickenaufschlag ab Auflage', einheit: 'Ex.', step: 5, min: 1, hinweis: 'A0 — zugleich Nullpunkt der Formel' },
  gcDickenAufschlagFaktor: { label: 'GC Dickenaufschlag: Faktor X', einheit: '€', step: 0.5, hinweis: 'pro mm über der Grenze und Exemplar über A0' },
};

const WV_VARIANT_LABELS = {
  standard_mit: 'mit Umschlag',
  standard_ohne: 'ohne Umschlag',
  banner_mit: 'Banner, mit Umschlag',
  banner_ohne: 'Banner, ohne Umschlag',
};

// Zwei Ebenen: produktübergreifende Basis vs. produktspezifische Werte.
// Die geplanten Bereiche zeigen den Ausbauweg und sind deaktiviert.
const SCOPES = [
  {
    key: 'basis',
    label: 'Gemeinsame Basis',
    hint: 'Gilt für alle Rechner: Papierpreise, Klickpreise, Gewichts-Zuschläge, Auftrags- und Veredelungs-Grundwerte.',
    tabs: [
      { key: 'papier', label: 'Papierpreise' },
      { key: 'klick', label: 'Klick & Bogen' },
      { key: 'veredelung', label: 'Veredelung & Auftrag' },
    ],
  },
  {
    key: 'rst',
    label: 'Rückstichheftung',
    hint: 'Nur für die Rückstichheftung: Umschlag-Zuschlag, Seitenlimits, Routen-Empfehlung und Verarbeitungstabellen.',
    tabs: [
      { key: 'faktoren', label: 'Faktoren & Grenzen' },
      { key: 'wv', label: 'Verarbeitungstabellen' },
    ],
  },
  { key: 'flyer', label: 'Flyer · geplant', planned: true, hint: '', tabs: [] },
  { key: 'poster', label: 'Poster · geplant', planned: true, hint: '', tabs: [] },
  { key: 'abschluss', label: 'Abschlussarbeiten · geplant', planned: true, hint: '', tabs: [] },
];

// Zuordnung der flachen settings-Keys auf die Anzeige-Gruppen der Tabs.
// Keys, die hier fehlen, landen generisch in der Gruppe „Weitere“.
const SETTINGS_GROUPS = {
  klick: [{ title: 'Klickpreise SRA3', keys: ['baseGrundpreis1c', 'baseGrundpreis4c', 'dynFaktorBanner'] }],
  veredelung: [
    { title: 'Cellophanierung', keys: ['celloGrundkosten', 'celloFaktorBanner'] },
    { title: 'Auftrag', keys: ['setupKosten', 'expressFaktor'] },
  ],
  faktoren: [
    { title: 'GC Umschlag-Zuschlag', keys: ['gcUmschlagGrundkosten', 'gcUmschlagStueckpreis', 'gcUmschlagAbAuflage'] },
    { title: 'GC Dickenaufschlag (weicher Übergang zum Partner)', keys: ['gcDickenAufschlagAbMm', 'gcDickenAufschlagAbAuflage', 'gcDickenAufschlagFaktor'] },
    { title: 'Seitenlimits (Broschürendicke)', keys: ['maxDickeGC', 'maxDickePartner'] },
    { title: 'Empfehlung der Route', keys: ['preferInternDelta', 'preferKoppDelta'] },
  ],
};
const GROUPED_SETTINGS_KEYS = new Set(
  Object.values(SETTINGS_GROUPS).flatMap((groups) => groups.flatMap((group) => group.keys)),
);

function fmtBogenpreis(preisPro1000) {
  return (preisPro1000 / 1000).toLocaleString('de-DE', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 5,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Zeitpunkt der letzten Veröffentlichung, z. B. "10.08.2026, 18:23 Uhr"
function fmtZeitpunkt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
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

// Zahleneingabe mit lokalem Draft: committet erst bei Blur/Enter (nicht pro
// Tastendruck) und nur Werte ≥ min — Zwischenzustände wie "0" auf dem Weg zu
// "0,5" erreichen die Config nie. Ungültige Eingaben fallen auf den alten Wert
// zurück, werden dabei aber kurz markiert statt still verworfen (B7).
function NumberField({ value, onCommit, step = 1, className = '', min }) {
  const [draft, setDraft] = useState(null);
  // Grund der letzten Ablehnung (roter Rand + Tooltip); verschwindet von selbst.
  const [rejected, setRejected] = useState(null);

  useEffect(() => {
    if (!rejected) return undefined;
    const timer = setTimeout(() => setRejected(null), 5000);
    return () => clearTimeout(timer);
  }, [rejected]);

  function commit() {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    setDraft(null);
    if (!Number.isFinite(parsed)) {
      setRejected(`„${draft}“ ist keine Zahl — der alte Wert bleibt stehen.`);
      return;
    }
    if (min !== undefined && parsed < min) {
      setRejected(
        `Wert abgelehnt: Minimum ist ${min.toLocaleString('de-DE')} — der alte Wert bleibt stehen.`,
      );
      return;
    }
    setRejected(null);
    if (parsed !== value) onCommit(parsed);
  }

  return (
    <input
      type="number"
      step={step}
      min={min}
      value={draft ?? value}
      title={rejected ?? undefined}
      onChange={(event) => {
        setRejected(null);
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={`tok-field rounded-[10px] border bg-input px-2.5 text-sm text-ink tabular-nums ${
        rejected ? 'border-bad-bd ring-1 ring-bad-bd' : 'border-line2'
      } ${className}`}
    />
  );
}

function Chip({ label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`h-[34px] rounded-full border px-[13px] text-[12.5px] font-medium transition-colors ${
        active ? 'border-brand-fg bg-brand-soft text-brand-fg' : 'border-line2 bg-transparent text-dim'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {label}
    </button>
  );
}

function FieldCard({ title, fields }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-[18px_20px_20px] shadow-card">
      <div className="mb-3.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-faint">
        {title}
      </div>
      <div className="flex flex-col gap-3.5">
        {fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-[5px]">
            <span className="flex justify-between gap-2.5 text-[12.5px] font-semibold text-ink">
              {field.label}
              <span className="font-normal text-faint">{field.einheit ?? ''}</span>
            </span>
            <NumberField
              value={field.value}
              step={field.step ?? 0.01}
              min={field.min ?? 0}
              className="h-10 w-full"
              onCommit={field.onCommit}
            />
            {field.hinweis && <span className="text-[11.5px] text-faint">{field.hinweis}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function Verwaltung() {
  // Startwert aus Offline-Cache/Default; der geteilte Stand wird sofort nachgeladen.
  const [config, setConfig] = useState(() => loadPricingConfigResult().config);
  const [scopeKey, setScopeKey] = useState('basis');
  const [tabKey, setTabKey] = useState('papier');
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('Alle');
  const [wvTableKey, setWvTableKey] = useState('gc_horizon');
  const [pendingImport, setPendingImport] = useState(null);
  // B3: liegengebliebener Pending-Publish, dessen Basis nicht mehr aktuell ist —
  // der Nutzer entscheidet, statt dass fremde Veröffentlichungen still überschrieben werden.
  const [pendingConflict, setPendingConflict] = useState(null);
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
        // Revision trotzdem übernehmen — sonst schickt „Auf Standard
        // zurücksetzen" baseRev 0 und scheitert im Schein-Konflikt (409).
        loadedRevRef.current = result.rev ?? 0;
        setSharedStatus({ state: 'invalid' });
        showMessage(
          'error',
          `Der geteilte Preisstand ist ungültig und wird nicht verwendet:\n${result.errors.join('\n')}\n` +
            'Mit „Auf Standard zurücksetzen" veröffentlichst du einen frischen gültigen Stand.',
        );
      } else {
        setSharedStatus({ state: 'offline' });
      }

      const pending = getPendingPublish();
      if (alive && pending) {
        if (canAutoPublishPending(pending, result.config)) {
          // Basis noch aktuell (oder nicht prüfbar — dann lehnt der Server eine
          // veraltete baseRev ohnehin mit 409 ab und der Konflikt wird gemeldet).
          setConfig(pending);
          showMessage('ok', 'Eine noch nicht veröffentlichte Änderung wird erneut veröffentlicht.');
          schedulePublish(pending, 0);
        } else {
          // Zwischenzeitlich wurde ein anderer Stand veröffentlicht → nicht
          // automatisch überschreiben, sondern den Nutzer entscheiden lassen.
          setPendingConflict({ pending, sharedConfig: result.config });
        }
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
      // Die Server-Revision aus der 409-Antwort ist die verlässlichste Basis —
      // auch wenn der frisch geladene Stand fehlt oder ungültig ist.
      if (Number.isFinite(result.currentRev)) loadedRevRef.current = result.currentRev;
      const fresh = await fetchSharedConfig();
      if (fresh.config) {
        loadedRevRef.current = configRev(fresh.config);
        setConfig(fresh.config);
      } else if (fresh.source === 'invalid' && Number.isFinite(fresh.rev)) {
        loadedRevRef.current = fresh.rev;
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

  // B3: Entscheidung des Nutzers zum veralteten Pending-Publish umsetzen.
  function publishPendingConflict() {
    if (!pendingConflict) return;
    setConfig(pendingConflict.pending);
    setPendingConflict(null);
    showMessage('ok', 'Deine liegengebliebene Änderung wird veröffentlicht und ersetzt den aktuellen geteilten Stand.');
    schedulePublish(pendingConflict.pending, 0);
  }

  function discardPendingConflict() {
    if (!pendingConflict) return;
    clearPendingPublish();
    setPendingConflict(null);
    showMessage('ok', 'Die liegengebliebene Änderung wurde verworfen — es gilt der aktuelle geteilte Stand.');
  }

  function applyPendingImport() {
    if (!pendingImport) return;
    const next = { ...pendingImport.nextConfig, meta: { ...pendingImport.nextConfig.meta, stand: todayIso() } };
    showMessage('ok', `Import "${pendingImport.sourceName}" übernommen — wird veröffentlicht.`);
    applyChange(next);
    setPendingImport(null);
  }

  const scope = SCOPES.find((entry) => entry.key === scopeKey) ?? SCOPES[0];
  const activeTab = scope.tabs.some((tab) => tab.key === tabKey) ? tabKey : scope.tabs[0]?.key;

  function selectScope(nextScope) {
    setScopeKey(nextScope.key);
    setTabKey(nextScope.tabs[0]?.key ?? '');
  }

  // Papierliste filtern; der Index in config.papiere bleibt für die Bearbeitung erhalten.
  const families = useMemo(
    () => ['Alle', ...new Set(config.papiere.map((paper) => paper.familie))],
    [config.papiere],
  );
  const filteredPapers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return config.papiere
      .map((paper, index) => ({ paper, index }))
      .filter(
        ({ paper }) =>
          (familyFilter === 'Alle' || paper.familie === familyFilter) &&
          (!needle || paper.name.toLowerCase().includes(needle)),
      );
  }, [config.papiere, query, familyFilter]);

  // Feldgruppen des aktiven Tabs aus den flachen Config-Keys zusammensetzen.
  const fieldGroups = useMemo(() => {
    const settingField = (key) => {
      const meta = SETTINGS_META[key] ?? {};
      return {
        key,
        label: meta.label ?? key,
        einheit: meta.einheit,
        step: meta.step,
        min: meta.min,
        hinweis: meta.hinweis,
        value: config.settings[key],
        onCommit: (value) =>
          updateConfig((next) => {
            next.settings[key] = value;
          }),
      };
    };

    const groups = (SETTINGS_GROUPS[activeTab] ?? [])
      .map((group) => ({
        title: group.title,
        fields: group.keys.filter((key) => key in config.settings).map(settingField),
      }))
      .filter((group) => group.fields.length > 0);

    if (activeTab === 'klick') {
      groups.push({
        title: 'Gewichts-Zuschläge € / Klick',
        fields: (config.gewichtszuschlaege ?? []).map((entry, index) => ({
          key: `gz-${entry.abGsm}`,
          label: `ab ${entry.abGsm} g/m²`,
          einheit: '€',
          step: 0.001,
          hinweis: '',
          value: entry.zuschlag,
          onCommit: (value) =>
            updateConfig((next) => {
              next.gewichtszuschlaege[index].zuschlag = value;
            }),
        })),
      });
    }

    if (activeTab === 'veredelung') {
      const arten = config.cello?.arten ?? [];
      groups.splice(1, 0, {
        title: 'Cello-Arten € / Bogen',
        fields: arten
          .map((art, index) => ({ art, index }))
          .filter(({ art }) => art.key !== 'ohne')
          .map(({ art, index }) => ({
            key: `cello-${art.key}`,
            label: art.name,
            einheit: '€',
            step: 0.01,
            hinweis: '',
            value: art.stueckpreis,
            onCommit: (value) =>
              updateConfig((next) => {
                next.cello.arten[index].stueckpreis = value;
              }),
          })),
      });

      // Unbekannte Keys (z. B. aus einer importierten Config) gehen nicht verloren.
      const unknown = Object.keys(config.settings).filter((key) => !GROUPED_SETTINGS_KEYS.has(key));
      if (unknown.length) {
        groups.push({ title: 'Weitere', fields: unknown.map(settingField) });
      }
    }

    return groups.filter((group) => group.fields.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, config]);

  // Ausgewählte WV-Tabelle gegen die (ggf. importierte) Config abgleichen —
  // fehlt der Key, fällt die Anzeige auf die erste vorhandene Tabelle zurück.
  const wvTableKeys = Object.keys(config.wvTabellen ?? {});
  const effectiveWvKey = wvTableKeys.includes(wvTableKey) ? wvTableKey : wvTableKeys[0];
  const wvTable = effectiveWvKey ? config.wvTabellen[effectiveWvKey] : {};
  const wvRows = Object.keys(wvTable).map(Number).sort((a, b) => a - b);
  const wvCols = [...new Set(wvRows.flatMap((r) => Object.keys(wvTable[r]).map(Number)))].sort(
    (a, b) => a - b,
  );
  const wvGrid = `84px repeat(${wvCols.length}, minmax(62px, 1fr))`;
  const paperGrid = 'minmax(220px,1fr) 90px 90px 110px 180px 120px';

  return (
    <div className="mx-auto max-w-[1560px] px-6 pb-16 pt-6">
      <PageHeader
        title="Verwaltung — Kalkulationsbasis"
        context={
          <>
            Gemeinsame Basis und Produkt-Faktoren · Version {config.meta.version} · Stand{' '}
            {config.meta.stand}
            {config.meta.publishedAt && ` · veröffentlicht ${fmtZeitpunkt(config.meta.publishedAt)}`}
            {sharedStatus.state === 'shared' && ' · geteilter Stand'}
            {sharedStatus.state === 'none' && ' · noch nicht veröffentlicht'}
            {sharedStatus.state === 'offline' && ' · geteilter Speicher offline'}
            {publishState.status === 'saving' && ' · speichere …'}
            {publishState.status === 'saved' && (
              <span className="text-good"> · ✓ für alle gespeichert</span>
            )}
            {publishState.status === 'offline' && ' · ⚠ nicht veröffentlicht (offline)'}
            {publishState.status === 'error' && ' · ⚠ nicht veröffentlicht'}
          </>
        }
      >
        <SecondaryButton icon={Download} label="Config (JSON)" onClick={handleExportJson} />
        <SecondaryButton
          icon={Upload}
          label="Config importieren"
          onClick={() => configFileRef.current?.click()}
        />
        <SecondaryButton icon={RotateCcw} label="Auf Standard zurücksetzen" onClick={handleReset} />
      </PageHeader>

      <input ref={configFileRef} type="file" accept=".json" onChange={handleConfigFile} className="hidden" />
      <input
        ref={paperFileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handlePaperFile}
        className="hidden"
      />

      <div className="mt-4 space-y-3">
        {sharedStatus.state === 'none' && (
          <div className="rounded-xl border border-line2 bg-surface px-4 py-3 text-[13px] text-dim">
            Es ist noch kein geteilter Preisstand veröffentlicht. Sobald du etwas änderst, eine
            Preisliste importierst oder „Auf Standard zurücksetzen“ klickst, wird der Stand für alle
            angelegt und ist überall sichtbar.
          </div>
        )}

        {hasNewerDefault && (
          <div className="rounded-xl border border-line2 bg-surface px-4 py-3 text-[13px] text-dim">
            Der im Repo hinterlegte Standard hat Version {defaultVersion}, der aktuelle Stand basiert
            auf {config.meta.version}. „Auf Standard zurücksetzen“ veröffentlicht den neuen Standard
            für alle — vorher bei Bedarf die aktuelle Config als JSON exportieren.
          </div>
        )}

        {pendingConflict && (
          <div className="rounded-xl border border-warn-bd bg-warn-soft px-4 py-3 text-warn">
            <p className="mb-1.5 text-[13px] font-semibold">
              Nicht veröffentlichte Änderung aus einer früheren Sitzung gefunden
            </p>
            <p className="text-[12.5px]">
              Deine Änderung basiert auf Stand {pendingConflict.pending.meta?.stand} (Rev{' '}
              {configRev(pendingConflict.pending)}) — inzwischen wurde aber ein neuerer Stand
              veröffentlicht ({pendingConflict.sharedConfig.meta?.stand}, Rev{' '}
              {configRev(pendingConflict.sharedConfig)}). „Meine Änderung veröffentlichen“ ersetzt
              diesen neueren Stand vollständig; „Verwerfen“ behält ihn und verwirft deine Änderung.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={publishPendingConflict}
                className="inline-flex h-9 items-center rounded-[10px] bg-brand px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                Meine Änderung veröffentlichen
              </button>
              <button
                type="button"
                onClick={discardPendingConflict}
                className="inline-flex h-9 items-center rounded-[10px] border border-line2 bg-surface px-4 text-xs font-semibold text-dim transition-colors hover:text-ink"
              >
                Verwerfen — aktuellen Stand behalten
              </button>
            </div>
          </div>
        )}

        {message && (
          <div
            className={`whitespace-pre-wrap rounded-xl border px-4 py-3 text-[13px] ${
              message.type === 'error'
                ? 'border-bad-bd bg-bad-soft text-bad'
                : 'border-good-bd bg-good-soft text-good'
            }`}
          >
            {message.text}
          </div>
        )}

        {pendingImport && (
          <div className="rounded-xl border border-warn-bd bg-warn-soft px-4 py-3 text-warn">
            <p className="mb-1.5 text-[13px] font-semibold">
              Import „{pendingImport.sourceName}“ prüfen und übernehmen
            </p>
            {pendingImport.kind === 'papierpreise' ? (
              <p className="text-[12.5px]">
                {pendingImport.summary.geaendert.length} Preise geändert
                {pendingImport.summary.geaendert.length > 0 &&
                  ` (${pendingImport.summary.geaendert.join(', ')})`}
                , {pendingImport.summary.unveraendert.length} unverändert
                {pendingImport.summary.unbekannt.length > 0 &&
                  `, ${pendingImport.summary.unbekannt.length} unbekannte ID übersprungen: ${pendingImport.summary.unbekannt.join(', ')}`}
                .
              </p>
            ) : (
              <p className="text-[12.5px]">
                Gesamt-Config Version {pendingImport.nextConfig.meta?.version} · Stand{' '}
                {pendingImport.nextConfig.meta?.stand} ersetzt die aktuelle Konfiguration.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={applyPendingImport}
                className="inline-flex h-9 items-center rounded-[10px] bg-brand px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                Übernehmen
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="inline-flex h-9 items-center rounded-[10px] border border-line2 bg-surface px-4 text-xs font-semibold text-dim transition-colors hover:text-ink"
              >
                Verwerfen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bereiche */}
      <div className="mt-[18px] flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-faint">
          Bereich
        </span>
        {SCOPES.map((entry) => (
          <Chip
            key={entry.key}
            label={entry.label}
            active={entry.key === scope.key}
            disabled={entry.planned}
            onClick={() => selectScope(entry)}
          />
        ))}
      </div>
      {scope.hint && <div className="mt-2 text-[12.5px] text-dim">{scope.hint}</div>}

      {/* Tabs */}
      <div className="mt-3.5 flex gap-6 border-b border-line">
        {scope.tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTabKey(tab.key)}
            className={`pb-3 pt-2.5 text-[13.5px] font-semibold transition-colors ${
              tab.key === activeTab
                ? 'text-ink shadow-[inset_0_-2px_0_var(--brand)]'
                : 'text-dim hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Papierpreise */}
      {activeTab === 'papier' && (
        <div className="mt-[18px]">
          <p className="mb-3.5 text-[12.5px] text-dim">
            Pflege ausschließlich pro 1000 Bogen — der Bogenpreis wird berechnet.
          </p>
          <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Papier suchen …"
              className="tok-field h-[38px] w-[230px] rounded-[10px] border border-line2 bg-input px-3 text-[13.5px] text-ink"
            />
            <div className="flex flex-wrap gap-1.5">
              {families.map((family) => (
                <Chip
                  key={family}
                  label={family === 'Alle' ? 'Alle Familien' : family}
                  active={familyFilter === family}
                  onClick={() => setFamilyFilter(family)}
                />
              ))}
            </div>
            <div className="flex-1" />
            <span className="text-[12.5px] text-faint">
              {filteredPapers.length} von {config.papiere.length} Papieren · Pflege pro 1000 Bogen
            </span>
            <div className="flex gap-1.5">
              <SecondaryButton icon={Download} label="CSV" onClick={handleExportCsv} />
              <SecondaryButton icon={FileSpreadsheet} label="XLSX" onClick={handleExportXlsx} />
              <SecondaryButton
                icon={Upload}
                label="CSV/XLSX importieren"
                onClick={() => paperFileRef.current?.click()}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px] overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div
                className="grid border-b border-line bg-surface2 px-5 py-[11px]"
                style={{ gridTemplateColumns: paperGrid }}
              >
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">Name</span>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">Familie</span>
                <span className="text-right text-[10.5px] font-bold tracking-[0.14em] text-faint">g/m²</span>
                <span className="text-right text-[10.5px] font-bold tracking-[0.14em] text-faint">Dicke (µm)</span>
                <span className="text-right text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">
                  Preis / 1000 Bogen €
                </span>
                <span className="text-right text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">
                  Preis / Bogen €
                </span>
              </div>
              {filteredPapers.map(({ paper, index }) => (
                <div
                  key={paper.id}
                  className="grid items-center border-b border-line px-5 py-1.5 transition-colors hover:bg-surface2"
                  style={{ gridTemplateColumns: paperGrid }}
                >
                  <span className="text-[13.5px] text-ink">
                    {paper.name}
                    {paper.isPlaceholder && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn"
                        title="Vorläufiger Wert — Preis/Name mit Guido klären"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Platzhalter
                      </span>
                    )}
                  </span>
                  <span className="text-[11.5px] font-bold tracking-[0.06em] text-brand-fg">
                    {paper.familie}
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-dim">{paper.gsm}</span>
                  <span className="text-right text-[13px] tabular-nums text-dim">{paper.dickeUm}</span>
                  <span className="text-right">
                    <NumberField
                      value={paper.preisPro1000}
                      step={0.5}
                      min={0.001}
                      className="h-8 w-[100px] text-right"
                      onCommit={(value) =>
                        updateConfig((next) => {
                          next.papiere[index].preisPro1000 = value;
                        })
                      }
                    />
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-dim">
                    {fmtBogenpreis(paper.preisPro1000)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grundpreise & Faktoren */}
      {fieldGroups.length > 0 && activeTab !== 'papier' && activeTab !== 'wv' && (
        <div className="mt-[18px]">
          <p className="mb-3.5 text-[12.5px] text-dim">
            Wirken sofort auf die Kalkulation; Standardwerte stehen in der Repo-Config.
          </p>
          <div className="grid items-start gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {fieldGroups.map((group) => (
              <FieldCard key={group.title} title={group.title} fields={group.fields} />
            ))}
          </div>
        </div>
      )}

      {/* Verarbeitungspreis-Tabellen */}
      {activeTab === 'wv' && (
        <div className="mt-[18px]">
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {wvTableKeys.map((key) => (
              <Chip
                key={key}
                label={wvTableLabels[key] ?? key}
                active={key === effectiveWvKey}
                onClick={() => setWvTableKey(key)}
              />
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="border-b border-line p-[16px_20px_13px]">
              <div className="text-sm font-semibold text-ink">
                {wvTableLabels[effectiveWvKey] ?? effectiveWvKey}
              </div>
              <div className="mt-[3px] text-[12.5px] text-dim">
                Zeile = Bogenteile · Spalte = Auflagenstaffel · zwischen Staffeln linear interpoliert
              </div>
            </div>

            <div className="overflow-x-auto">
              <div
                className="grid gap-1.5 border-b border-line bg-surface2 px-5 py-2"
                style={{ gridTemplateColumns: wvGrid }}
              >
                <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">
                  BT \ Auflage
                </span>
                {wvCols.map((col) => (
                  <span
                    key={col}
                    className="text-right text-[11.5px] font-bold tabular-nums text-faint"
                  >
                    {col}
                  </span>
                ))}
              </div>
              {wvRows.map((row) => (
                <div
                  key={row}
                  className="grid items-center gap-1.5 border-b border-line px-5 py-[5px]"
                  style={{ gridTemplateColumns: wvGrid }}
                >
                  <span className="text-[13px] font-semibold tabular-nums text-ink">{row}</span>
                  {wvCols.map((col) => {
                    const value = wvTable[row][col];
                    return value !== undefined ? (
                      <NumberField
                        key={col}
                        value={value}
                        step={0.5}
                        min={0.001}
                        className="h-[30px] w-full rounded-[7px] border-line px-[7px] text-right text-[12.5px]"
                        onCommit={(nextValue) =>
                          updateConfig((next) => {
                            next.wvTabellen[effectiveWvKey][row][col] = nextValue;
                          })
                        }
                      />
                    ) : (
                      <span key={col} className="text-right text-[12.5px] text-faint">
                        —
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="p-[12px_20px] text-[11.5px] text-faint">
              Strukturänderungen (neue Staffeln oder Zeilen) über den JSON-Import der Gesamt-Config.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
