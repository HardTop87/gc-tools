import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

import { fetchSharedConfig, loadPricingConfigResult } from '../utils/pricingConfig';
import { pruefeRSTPflichtfelder } from '../utils/rstFormInput';
import {
  DRUCK_OPTIONS,
  calculateRSTPrice,
  getCelloLabels,
  getCelloOptions,
  getContentPaperOptions,
  getCoverPaperOptions,
  getFormatOptions,
  getInitialRSTForm,
} from '../utils/calculateRSTPrice';

const druckOptions = DRUCK_OPTIONS;

function eur(n, digits = 2) {
  return (
    Number(n).toLocaleString('de-DE', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + ' €'
  );
}

function num(n, digits = 0) {
  return Number(n).toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const FIELD_LABEL = 'text-[10.5px] font-bold uppercase tracking-[0.16em] text-faint';
const FIELD_CONTROL =
  'tok-field h-[38px] rounded-[10px] border border-line2 bg-input px-2.5 text-sm text-ink';

function Field({ label, className = '', children }) {
  return (
    <label className={`flex flex-col gap-[5px] ${className}`}>
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </label>
  );
}

function Divider() {
  return <div className="hidden w-px self-stretch bg-line xl:block" />;
}

export default function RechnerRST() {
  // Startwert aus dem Offline-Cache bzw. Repo-Default, danach lädt ein Effect
  // den geteilten Stand nach. So rendert die Seite sofort und ohne Flackern.
  const [config, setConfig] = useState(() => loadPricingConfigResult().config);
  // Warnzustand zum geteilten Preisstand: null (alles gut), 'offline'
  // (nicht erreichbar) oder 'invalid' (geteilter Stand ungültig, B2).
  const [configWarnung, setConfigWarnung] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [form, setForm] = useState(() => getInitialRSTForm(config));
  const [toast, setToast] = useState(null);
  const mountedRef = useRef(true);
  const refreshSeqRef = useRef(0);
  const toastTimerRef = useRef(null);

  // Kurzer Hinweis (2,5 s), z. B. wenn eine Eingabe automatisch korrigiert wurde
  function showToast(text) {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // Seitenzahl beim Verlassen des Felds (bzw. Enter) auf die nächste echte
  // Eingabemöglichkeit aufrunden: Vielfache von 4, Minimum 8 ohne / 4 mit
  // Umschlag. Nicht bei jedem Tastendruck — sonst könnte man „36" nie tippen,
  // weil schon die „3" korrigiert würde.
  function normalizeSeiten() {
    const n = parseInt(form.seiten, 10);
    const min = form.hasUmschlag ? 4 : 8;
    const corrected = Number.isFinite(n) ? Math.max(min, Math.ceil(n / 4) * 4) : min;
    if (String(corrected) === form.seiten) return;
    setForm((prev) => ({ ...prev, seiten: String(corrected) }));
    showToast(
      Number.isFinite(n)
        ? `Seitenzahl auf ${corrected} korrigiert — möglich sind Vielfache von 4.`
        : `Seitenzahl auf ${corrected} gesetzt.`,
    );
  }

  const settings = config.settings;
  const formatOptions = getFormatOptions(config);
  const celloLabels = useMemo(() => getCelloLabels(config), [config]);
  const contentPaperOptions = getContentPaperOptions(config, form.formatKey);
  const coverPaperOptions = getCoverPaperOptions(config, form.formatKey, form.pInhaltId);
  const celloOptions = getCelloOptions(config, form.pUmschlagId);
  const selectedContentPaper = contentPaperOptions.find((paper) => paper.id === form.pInhaltId);
  const selectedCoverPaper = coverPaperOptions.find((paper) => paper.id === form.pUmschlagId);
  const expressProzent = Math.round((settings.expressFaktor || 0) * 100);

  useEffect(() => {
    const contentStillValid = contentPaperOptions.some((paper) => paper.id === form.pInhaltId);
    if (!contentStillValid && contentPaperOptions[0]) {
      setForm((prev) => ({ ...prev, pInhaltId: contentPaperOptions[0].id }));
    }
  }, [contentPaperOptions, form.pInhaltId]);

  useEffect(() => {
    const coverStillValid = coverPaperOptions.some((paper) => paper.id === form.pUmschlagId);
    const nextCoverId = coverStillValid ? form.pUmschlagId : coverPaperOptions[0]?.id ?? '';
    const celloStillValid = getCelloOptions(config, nextCoverId).some(
      (option) => option.value === form.celloUmschlag,
    );
    const nextCello = celloStillValid ? form.celloUmschlag : 'ohne';

    if (nextCoverId !== form.pUmschlagId || nextCello !== form.celloUmschlag) {
      setForm((prev) => ({
        ...prev,
        pUmschlagId: nextCoverId,
        celloUmschlag: nextCello,
      }));
    }
  }, [config, coverPaperOptions, form.pUmschlagId, form.celloUmschlag]);

  useEffect(() => {
    if (!form.hasUmschlag && form.celloUmschlag !== 'ohne') {
      setForm((prev) => ({ ...prev, celloUmschlag: 'ohne' }));
    }
  }, [form.hasUmschlag, form.celloUmschlag]);

  // Geteilten Preisstand laden: beim Öffnen und wenn der Tab wieder sichtbar
  // wird. Nur EIN Listener (visibilitychange); veraltete Antworten werden über
  // eine Sequenznummer verworfen, damit eine langsamere ältere Antwort nie einen
  // neueren Stand überschreibt.
  useEffect(() => {
    mountedRef.current = true;
    const refresh = async () => {
      const seq = ++refreshSeqRef.current;
      const result = await fetchSharedConfig();
      if (!mountedRef.current || seq !== refreshSeqRef.current) return;
      if (result.config) setConfig(result.config);
      // 'error' = Netz-/Timeout-Fehler, 'invalid' = geteilter Stand ungültig —
      // beide Fälle rechnen mit dem lokalen Cache/Default und müssen warnen (B2).
      setConfigWarnung(
        result.source === 'error' ? 'offline' : result.source === 'invalid' ? 'invalid' : null,
      );
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // B4: Bei leerer/ungültiger Auflage oder Seitenzahl wird NICHT gerechnet —
  // die Engine würde still mit Defaults (Auflage 1, 8 Seiten) einen plausiblen
  // falschen Preis liefern. Stattdessen zeigt die UI einen klaren Hinweis.
  const eingabeProbleme = pruefeRSTPflichtfelder(form);
  const eingabeOk = eingabeProbleme.length === 0;

  // Gerechnet wird live bei jeder Eingabe aus dem aktuell geladenen Stand.
  const calculation = useMemo(
    () => (eingabeOk ? calculateRSTPrice(form, config) : null),
    [eingabeOk, form, config],
  );

  // Fallback-Button: holt den geteilten Stand nach; die Neuberechnung ergibt
  // sich automatisch aus dem neuen config-State.
  async function handleCalculate() {
    setIsCalculating(true);
    try {
      const result = await fetchSharedConfig();
      if (!mountedRef.current) return;
      if (result.config) setConfig(result.config);
      setConfigWarnung(
        result.source === 'error' ? 'offline' : result.source === 'invalid' ? 'invalid' : null,
      );
    } finally {
      if (mountedRef.current) setIsCalculating(false);
    }
  }

  const results = useMemo(() => calculation?.results ?? [], [calculation]);
  const cheapestPrice = calculation?.cheapestPrice ?? Infinity;
  const recommendedName = calculation?.recommendedName ?? null;
  const recommended = results.find((r) => !r.error && r.name === recommendedName) ?? null;
  // B6: Die Statuszeile spricht für die empfohlene, hilfsweise die erste
  // gültige Route — nicht stur für results[0] (das wäre immer GC).
  const statusRoute = recommended ?? results.find((r) => !r.error) ?? null;
  const bogenteileGesamt =
    (parseInt(form.seiten, 10) || 8) / 4 + (form.hasUmschlag ? 1 : 0);
  const auflageNum = parseInt(form.auflage, 10) || 1;

  const summaryLine = `${formatOptions.find((o) => o.value === form.formatKey)?.label ?? '—'} · ${auflageNum} Ex. · ${form.seiten} Seiten${
    form.hasUmschlag ? ' + Umschlag' : ''
  }${parseInt(form.seiten, 10) === 4 ? ' (nur mit Umschlag möglich)' : ''} · ${
    Number.isFinite(cheapestPrice)
      ? `günstigste Route: ${results.find((r) => !r.error && r.gesamt === cheapestPrice)?.name}`
      : 'keine Route möglich'
  }`;

  const techLine = statusRoute
    ? `${statusRoute.name}: ${statusRoute.formatName} · ${statusRoute.nutzen} Nutzen · ${num(statusRoute.weightPerCopyG, 1)} g / Stück · ${num(
        statusRoute.bogenInhalt + statusRoute.bogenUmschlag,
      )} Bögen`
    : 'Kombination bei keiner Route möglich';
  const maxSeitenLabel = statusRoute ? statusRoute.maxSeiten : '—';

  // Zeilen der Vergleichstabelle. `pick` liefert Anzeigewert, optionale
  // Zweitzeile und — für die Diff-Hervorhebung — den Zahlenwert.
  const matrix = useMemo(() => {
    const valid = results.filter((r) => !r.error);
    const anyZuschlag = valid.some((r) => r.umschlagZuschlag > 0);
    const anyDickenAufschlag = valid.some((r) => r.dickenAufschlag > 0);
    const anyExpress = valid.some((r) => r.expressSurcharge > 0);

    const out = [];
    let dataIndex = 0;

    const head = (label) => out.push({ kind: 'head', label });
    const row = (label, pick, options = {}) => {
      dataIndex += 1;
      const zebra = !options.strong && dataIndex % 2 === 0;
      const cells = results.map((result) => {
        if (result.error) return { value: '—', sub: '', muted: true };
        const picked = pick(result);
        let chip = null;
        if (options.diff && recommended && picked.n != null) {
          const reference = pick(recommended).n;
          if (reference != null && Math.abs(picked.n - reference) > 0.005) {
            chip = picked.n > reference ? 'up' : 'down';
          }
        }
        const highlight =
          options.strong && Number.isFinite(cheapestPrice) && result.gesamt === cheapestPrice;
        return { value: picked.v, sub: picked.sub ?? '', chip, highlight };
      });
      out.push({ kind: 'row', label, cells, zebra, strong: !!options.strong, thick: !!options.thick });
    };

    head('Technik');
    row('Druck-Format', (r) => ({ v: `${r.formatName} · ${r.nutzen} Nutzen` }));
    row(
      'Bögen gesamt',
      (r) => ({
        v: `${num(r.bogenInhalt + r.bogenUmschlag)} Stk`,
        n: r.bogenInhalt + r.bogenUmschlag,
        sub: `Makulatur ${num(r.makulaturProzent, 1)} % · ${r.makulaturInhalt} (I)${r.bogenUmschlag ? ` · ${r.makulaturUmschlag} (U)` : ''}`,
      }),
      { diff: true },
    );
    row('Gewicht / Stück', (r) => ({ v: `${num(r.weightPerCopyG, 1)} g` }));
    row('Gewicht Auflage', (r) => ({ v: `${num(r.weightTotalKg, 2)} kg` }));

    head('Kosten');
    row(
      'Papierkosten',
      (r) => ({
        v: eur(r.kostenPapierGesamt),
        n: r.kostenPapierGesamt,
        sub: r.bogenUmschlag
          ? `Inhalt ${eur(r.kostenPapierInhalt)} / Umschlag ${eur(r.kostenPapierUmschlag)}`
          : '',
      }),
      { diff: true },
    );
    row(
      'Druckkosten',
      (r) => ({
        v: eur(r.kostenKlickGesamt),
        n: r.kostenKlickGesamt,
        sub: r.bogenUmschlag
          ? `Inhalt ${eur(r.kostenKlickInhalt)} / Umschlag ${eur(r.kostenKlickUmschlag)}`
          : '',
      }),
      { diff: true },
    );
    row(
      'Verarbeitung',
      (r) => ({
        v: eur(r.wvKosten),
        n: r.wvKosten,
        sub: `${bogenteileGesamt} Bogenteile · Auflage ${auflageNum}`,
      }),
      { diff: true },
    );
    if (anyZuschlag) {
      row(
        'Umschlag-Zuschlag (Rillung)',
        (r) => ({ v: eur(r.umschlagZuschlag), n: r.umschlagZuschlag }),
        { diff: true },
      );
    }
    if (anyDickenAufschlag) {
      row(
        'Dickenaufschlag (Buchdicke × Auflage)',
        (r) => ({ v: eur(r.dickenAufschlag), n: r.dickenAufschlag }),
        { diff: true },
      );
    }
    row(
      'Cellophanierung',
      (r) => ({
        v: eur(r.celloKosten),
        n: r.celloKosten,
        sub: `${celloLabels[r.celloType] || 'Ohne'} · Grund ${eur(r.celloGrundkosten)} · Bogen ${eur(r.celloBogenkosten)}`,
      }),
      { diff: true },
    );
    row('Einrichtekosten', (r) => ({ v: eur(r.setupKosten), n: r.setupKosten }), { diff: true });
    if (anyExpress) {
      row(
        `Express-Aufschlag (+${expressProzent} %)`,
        (r) => ({ v: eur(r.expressSurcharge), n: r.expressSurcharge }),
        { diff: true },
      );
    }
    row(
      'Gesamt',
      (r) => ({ v: eur(r.gesamt), n: r.gesamt, sub: `${eur(r.stueckPreis, 4)} / Stück` }),
      { strong: true, thick: true },
    );

    head('Kennzahlen');
    row('DB Druck', (r) => ({
      v: `${num(r.dbDruckInhalt, 3)} (I)${r.bogenUmschlag ? ` · ${num(r.dbDruckUmschlag, 3)} (U)` : ''}`,
    }));
    row('DB Papier', (r) => ({
      v: `${num(r.dbPapierInhalt, 3)} (I)${r.bogenUmschlag ? ` · ${num(r.dbPapierUmschlag, 3)} (U)` : ''}`,
    }));
    row('Gewichts-Zuschlag', (r) => ({
      v: `${eur(r.gewichtszuschlagInhalt, 3)} (I)${
        r.bogenUmschlag ? ` · ${eur(r.gewichtszuschlagUmschlag, 3)} (U)` : ''
      }`,
    }));
    row('Max. Seiten (Papierdicke)', (r) => ({ v: `${r.maxSeiten} Seiten` }));
    row('Lieferzeit', (r) => ({ v: `${r.produktionszeitWT} Werktage`, n: r.produktionszeitWT }), {
      diff: true,
    });

    return out;
  }, [
    results,
    recommended,
    cheapestPrice,
    celloLabels,
    expressProzent,
    bogenteileGesamt,
    auflageNum,
  ]);

  const gridTemplate = `260px repeat(${results.length}, minmax(0, 1fr))`;

  return (
    <div className="mx-auto max-w-[1560px] px-6 pb-16 pt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-ink">
            Kalkulator Rückstichheftung
          </h1>
          <div className="mt-[5px] text-[13px] text-dim">
            Preisbasis {config.meta.version} · Stand {config.meta.stand} · gepflegt in der{' '}
            <Link to="/verwaltung" className="text-brand-fg hover:underline">
              Verwaltung
            </Link>
          </div>
        </div>
      </div>

      {configWarnung && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warn-bd bg-warn-soft px-4 py-3 text-[13px] text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {configWarnung === 'invalid'
              ? `Der geteilte Preisstand ist ungültig und wird nicht verwendet — es gilt der lokale Stand (${config.meta.stand}). Bitte in der Verwaltung prüfen; die Preise sind möglicherweise nicht aktuell.`
              : `Der geteilte Preisstand ist gerade nicht erreichbar — es gilt der zuletzt geladene Stand (${config.meta.stand}). Die Preise sind möglicherweise nicht aktuell.`}
          </span>
        </div>
      )}

      {/* Eingabeleiste */}
      <div className="sticky top-[52px] z-40 mb-[18px] rounded-2xl border border-line bg-surface p-[14px_16px] shadow-card">
        <div className="flex flex-wrap items-end gap-x-[18px] gap-y-3.5">
          <Field label="Endformat" className="min-w-[200px]">
            <select
              value={form.formatKey}
              onChange={(event) => updateForm('formatKey', event.target.value)}
              className={FIELD_CONTROL}
            >
              {formatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Auflage" className="w-[100px]">
            <input
              type="number"
              min="1"
              value={form.auflage}
              onChange={(event) => updateForm('auflage', event.target.value)}
              className={`${FIELD_CONTROL} tabular-nums`}
            />
          </Field>

          <Field label="Seiten" className="w-[92px]">
            <input
              type="number"
              min="4"
              step="4"
              value={form.seiten}
              onChange={(event) => {
                const value = event.target.value;
                // 4 Seiten Inhalt gibt es nur mit Umschlag (P3) — automatisch aktivieren
                setForm((prev) => ({
                  ...prev,
                  seiten: value,
                  hasUmschlag: parseInt(value, 10) === 4 ? true : prev.hasUmschlag,
                }));
              }}
              onBlur={normalizeSeiten}
              onKeyDown={(event) => {
                if (event.key === 'Enter') normalizeSeiten();
              }}
              className={`${FIELD_CONTROL} tabular-nums`}
            />
          </Field>

          <Divider />

          <Field label="Inhalt · Papier" className="min-w-[196px]">
            <select
              value={form.pInhaltId}
              onChange={(event) => updateForm('pInhaltId', event.target.value)}
              className={FIELD_CONTROL}
            >
              {contentPaperOptions.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.name}
                  {paper.isPlaceholder ? ' ⚠ Platzhalter' : ''}
                </option>
              ))}
            </select>
            {selectedContentPaper?.isPlaceholder && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-warn">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Vorläufiger Preis — Klärung mit Guido steht aus.
              </span>
            )}
          </Field>

          <Field label="Inhalt · Druck" className="min-w-[150px]">
            <select
              value={form.dInhaltKey}
              onChange={(event) => updateForm('dInhaltKey', event.target.value)}
              className={FIELD_CONTROL}
            >
              {druckOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Divider />

          <label className="flex h-[38px] cursor-pointer items-center gap-[9px] rounded-[10px] border border-line2 bg-surface2 px-[13px] text-[13.5px] font-medium text-ink">
            <input
              type="checkbox"
              checked={form.hasUmschlag}
              onChange={(event) => {
                const checked = event.target.checked;
                // Abwahl bei 4 Seiten: zurück auf das Minimum ohne Umschlag (P3)
                setForm((prev) => ({
                  ...prev,
                  hasUmschlag: checked,
                  seiten: !checked && parseInt(prev.seiten, 10) < 8 ? '8' : prev.seiten,
                }));
              }}
              className="h-[15px] w-[15px] accent-brand"
            />
            Mit Umschlag
          </label>

          {form.hasUmschlag && (
            <div className="flex flex-wrap items-end gap-3.5 rounded-[0_12px_12px_0] border-l-[3px] border-brand bg-brand-soft px-3.5 py-2">
              <Field label="Umschlag · Papier" className="min-w-[186px]">
                <select
                  value={form.pUmschlagId}
                  onChange={(event) => updateForm('pUmschlagId', event.target.value)}
                  className={FIELD_CONTROL}
                >
                  {coverPaperOptions.map((paper) => (
                    <option key={paper.id} value={paper.id}>
                      {paper.name}
                      {paper.isPlaceholder ? ' ⚠ Platzhalter' : ''}
                    </option>
                  ))}
                </select>
                {selectedCoverPaper?.isPlaceholder && (
                  <span className="flex items-center gap-1.5 text-[11.5px] text-warn">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Vorläufiger Preis — Klärung mit Guido steht aus.
                  </span>
                )}
              </Field>

              <Field label="Druck" className="min-w-[140px]">
                <select
                  value={form.dUmschlagKey}
                  onChange={(event) => updateForm('dUmschlagKey', event.target.value)}
                  className={FIELD_CONTROL}
                >
                  {druckOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Cellophanierung" className="min-w-[168px]">
                <select
                  value={form.celloUmschlag}
                  onChange={(event) => updateForm('celloUmschlag', event.target.value)}
                  className={FIELD_CONTROL}
                >
                  {celloOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <Field label="Produktionszeit" className="min-w-[160px]">
            <select
              value={form.produktionszeit}
              onChange={(event) => updateForm('produktionszeit', event.target.value)}
              className={FIELD_CONTROL}
            >
              <option value="standard">Standard</option>
              <option value="express">{`Express (+${expressProzent} %)`}</option>
            </select>
          </Field>

          <div className="min-w-[20px] flex-1" />

          <div className="flex items-center gap-3">
            <span className="text-xs text-faint">rechnet live</span>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={isCalculating}
              className="h-[38px] rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-70"
            >
              {isCalculating ? 'Aktuelle Preise laden …' : 'Preis berechnen'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-[22px] gap-y-1 border-t border-line pt-[11px] text-[12.5px] text-dim">
          <span>{eingabeOk ? techLine : eingabeProbleme.join(' · ')}</span>
          <span>
            Papierfamilie {selectedContentPaper?.familie ?? '—'} — Umschlag muss derselben Familie
            entsprechen
          </span>
          <span>
            max. {maxSeitenLabel} Seiten bei dieser Papierkombination
            {statusRoute ? ` (${statusRoute.name})` : ''}
          </span>
        </div>
      </div>

      {/* Vergleichstabelle — bei unvollständigen Pflichtfeldern stattdessen
          ein klarer Hinweis, damit nie ein plausibler falscher Preis steht (B4) */}
      {!eingabeOk ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">
            {eingabeProbleme.join(' ')}
          </p>
          <p className="mt-1.5 text-[13px] text-dim">
            Die Preisberechnung startet, sobald Auflage und Seitenzahl vollständig eingegeben sind.
          </p>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <div className="min-w-[1040px] overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="grid border-b border-line" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="flex flex-col justify-end gap-1 p-[18px_20px]">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-faint">
                Vergleich
              </span>
              <span className="text-[12.5px] text-dim">{summaryLine}</span>
            </div>
            {results.map((result) => {
              const ok = !result.error;
              const isCheapest = ok && result.gesamt === cheapestPrice;
              const isRecommended = ok && result.name === recommendedName;
              const badge = !ok
                ? ''
                : isRecommended && isCheapest
                  ? 'Empfohlen · günstigste'
                  : isRecommended
                    ? 'Empfohlen'
                    : isCheapest
                      ? 'Günstigste'
                      : '';
              return (
                <div
                  key={result.key}
                  className={`border-l border-line p-[18px_20px] ${isRecommended ? 'bg-good-soft' : ''}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold text-ink">{result.name}</span>
                    {badge && (
                      <span
                        className={`rounded-full px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[0.06em] ${
                          isCheapest ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[26px] font-bold tracking-[-0.02em] tabular-nums ${
                      isCheapest ? 'text-good' : 'text-ink'
                    }`}
                  >
                    {ok ? eur(result.gesamt) : '—'}
                  </div>
                  <div className="mt-[3px] text-xs tabular-nums text-dim">
                    {ok
                      ? `${eur(result.stueckPreis, 4)} / Stück · ${result.produktionszeitWT} Werktage`
                      : result.error}
                  </div>
                </div>
              );
            })}
          </div>

          {matrix.map((entry, index) =>
            entry.kind === 'head' ? (
              <div
                key={`head-${entry.label}`}
                className="border-t border-line bg-surface p-[13px_20px_7px] text-[10.5px] font-bold uppercase tracking-[0.16em] text-faint"
              >
                {entry.label}
              </div>
            ) : (
              <div
                key={`row-${entry.label}-${index}`}
                className={`grid border-t ${entry.thick ? 'border-line2' : 'border-line'} ${
                  entry.strong ? 'bg-surface2' : entry.zebra ? 'bg-zebra' : ''
                }`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div
                  className={`p-[9px_20px] text-[13px] text-dim ${entry.strong ? 'font-bold' : ''}`}
                >
                  {entry.label}
                </div>
                {entry.cells.map((cell, cellIndex) => (
                  <div
                    key={cellIndex}
                    className="border-l border-line p-[9px_20px] text-right"
                  >
                    <div
                      className={`-mr-1.5 inline-block rounded-[5px] px-1.5 py-px text-[13px] tabular-nums ${
                        entry.strong ? 'font-bold' : ''
                      } ${
                        cell.muted
                          ? 'text-faint'
                          : cell.chip === 'up'
                            ? 'bg-diffUp text-diffUp-fg'
                            : cell.chip === 'down'
                              ? 'bg-diffDown text-diffDown-fg'
                              : cell.highlight
                                ? 'text-good'
                                : 'text-ink'
                      }`}
                    >
                      {cell.value}
                    </div>
                    {cell.sub && (
                      <div className="mt-0.5 text-[11px] italic tabular-nums text-faint">
                        {cell.sub}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ),
          )}

          <div className="flex flex-wrap gap-[18px] border-t border-line p-[12px_20px] text-[11.5px] text-faint">
            <span>
              Zwischen Auflagenstaffeln wird linear interpoliert · Preisbasis {config.meta.version} ·
              Stand {config.meta.stand}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-[3px] bg-diffUp" />
              teurer als Empfehlung
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-[3px] bg-diffDown" />
              günstiger als Empfehlung
            </span>
          </div>
        </div>
      </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-medium text-ink shadow-card">
          {toast}
        </div>
      )}
    </div>
  );
}
