import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  ChevronDown,
  FileText,
  Settings2,
  Sparkles,
} from 'lucide-react';

import { PRICING_CONFIG } from '../data/pricingData';
import {
  calculateRSTPrice,
  getCelloOptions,
  getContentPaperOptions,
  getCoverPaperOptions,
  getInitialRSTForm,
} from '../utils/calculateRSTPrice';

const { celloLabels, defaults, druckOptions, formatOptions, routes } = PRICING_CONFIG;

function fmt(n, digits = 2) {
  return n.toFixed(digits).replace('.', ',');
}

function fmtG(g) {
  if (g >= 1000) {
    return (
      (g / 1000).toLocaleString('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + ' kg'
    );
  }

  return (
    g.toLocaleString('de-DE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + ' g'
  );
}

function fmtKg(kg) {
  return (
    kg.toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' kg'
  );
}

function inputBaseClassName() {
  return 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10';
}

function panelClassName() {
  return 'rounded-3xl border border-slate-200 bg-white/90 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur';
}

export default function NeuesTool() {
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [calculation, setCalculation] = useState(null);
  const [form, setForm] = useState(() => getInitialRSTForm());
  const [settings, setSettings] = useState(() => ({ ...defaults.settings }));

  const contentPaperOptions = getContentPaperOptions(form.formatKey);
  const coverPaperOptions = getCoverPaperOptions(form.formatKey, form.pInhaltId);
  const celloOptions = getCelloOptions(form.pUmschlagId);

  useEffect(() => {
    const contentStillValid = contentPaperOptions.some((paper) => paper.id === form.pInhaltId);
    if (!contentStillValid && contentPaperOptions[0]) {
      setForm((prev) => ({ ...prev, pInhaltId: contentPaperOptions[0].id }));
    }
  }, [contentPaperOptions, form.pInhaltId]);

  useEffect(() => {
    const coverStillValid = coverPaperOptions.some((paper) => paper.id === form.pUmschlagId);
    const nextCoverId = coverStillValid ? form.pUmschlagId : coverPaperOptions[0]?.id ?? '';
    const celloStillValid = getCelloOptions(nextCoverId).some(
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
  }, [coverPaperOptions, form.pUmschlagId, form.celloUmschlag]);

  useEffect(() => {
    if (!form.hasUmschlag && form.celloUmschlag !== 'ohne') {
      setForm((prev) => ({ ...prev, celloUmschlag: 'ohne' }));
    }
  }, [form.hasUmschlag, form.celloUmschlag]);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSettings(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleCalculate() {
    setCalculation(calculateRSTPrice(form, settings));
  }

  const results = calculation?.results ?? null;
  const cheapestPrice = calculation?.cheapestPrice ?? Infinity;
  const recommendedName = calculation?.recommendedName ?? null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_rgba(241,245,249,0.92),_rgba(226,232,240,0.95))] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 text-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.85)]">
          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.4fr_0.8fr] lg:px-10 lg:py-8">
            <div className="space-y-4">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-[#8e014d]"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200">
                <Sparkles className="h-3.5 w-3.5" />
                Internes Kalkulationstool
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Kalkulator Rückstichheftung
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                  Selbständige React-Seite für Broschüren- und Heftkalkulation mit
                  interner Produktion, Kopp und ILDA.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-300">
                  <FileText className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Formate
                  </span>
                </div>
                <p className="text-2xl font-semibold">{formatOptions.length}</p>
                <p className="mt-1 text-sm text-slate-400">Standard und Banner</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-300">
                  <Calculator className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Produzenten
                  </span>
                </div>
                <p className="text-2xl font-semibold">{routes.length}</p>
                <p className="mt-1 text-sm text-slate-400">Intern, Kopp, ILDA</p>
              </div>
            </div>
          </div>
        </header>

        <div className={`${panelClassName()} mb-6 overflow-hidden`}>
          <button
            type="button"
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left sm:px-8"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-950 p-2 text-white">
                <Settings2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Basis-Einstellungen</p>
                <p className="text-sm text-slate-500">
                  Grundpreise, Multiplikatoren, Auftrag und Empfehlungslogik
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-slate-500 transition ${
                settingsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {settingsOpen && (
            <div className="border-t border-slate-200 px-6 py-6 sm:px-8">
              <div className="grid gap-6 xl:grid-cols-4">
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                    Grundpreise SRA3
                  </p>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">SW (1c) €</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={settings.baseGrundpreis1c}
                      onChange={(event) =>
                        updateSettings('baseGrundpreis1c', event.target.value)
                      }
                      className={inputBaseClassName()}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Farbe (4c) €</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={settings.baseGrundpreis4c}
                      onChange={(event) =>
                        updateSettings('baseGrundpreis4c', event.target.value)
                      }
                      className={inputBaseClassName()}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                    Multiplikatoren
                  </p>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Faktor Banner</span>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={settings.dynFaktorBanner}
                      onChange={(event) => updateSettings('dynFaktorBanner', event.target.value)}
                      className={inputBaseClassName()}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">
                      Faktor Klick SRA4
                    </span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={settings.dynFaktorKlickSRA4}
                      onChange={(event) =>
                        updateSettings('dynFaktorKlickSRA4', event.target.value)
                      }
                      className={inputBaseClassName()}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                    Auftrag
                  </p>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">
                      Grundkosten Cello €
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={settings.celloGrundkosten}
                      onChange={(event) =>
                        updateSettings('celloGrundkosten', event.target.value)
                      }
                      className={inputBaseClassName()}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">
                      Einrichtekosten €
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={settings.setupKosten}
                      onChange={(event) => updateSettings('setupKosten', event.target.value)}
                      className={inputBaseClassName()}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                    Empfehlung
                  </p>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Intern bis + €</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={settings.preferInternDelta}
                      onChange={(event) =>
                        updateSettings('preferInternDelta', event.target.value)
                      }
                      className={inputBaseClassName()}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Kopp bis + €</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={settings.preferKoppDelta}
                      onChange={(event) =>
                        updateSettings('preferKoppDelta', event.target.value)
                      }
                      className={inputBaseClassName()}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className={`${panelClassName()} h-fit xl:sticky xl:top-6`}>
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-950 p-2 text-white">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Produktdaten</h2>
                  <p className="text-sm text-slate-500">Eingaben für die Kalkulation</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-6 py-6">
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Endformat</span>
                <select
                  value={form.formatKey}
                  onChange={(event) => updateForm('formatKey', event.target.value)}
                  className={inputBaseClassName()}
                >
                  {formatOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-slate-700">Auflage</span>
                  <input
                    type="number"
                    min="1"
                    value={form.auflage}
                    onChange={(event) => updateForm('auflage', event.target.value)}
                    className={inputBaseClassName()}
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-slate-700">Seiten</span>
                  <input
                    type="number"
                    min="8"
                    step="4"
                    value={form.seiten}
                    onChange={(event) => updateForm('seiten', event.target.value)}
                    className={inputBaseClassName()}
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                  Inhalt
                </p>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Papier</span>
                <select
                  value={form.pInhaltId}
                  onChange={(event) => updateForm('pInhaltId', event.target.value)}
                  className={inputBaseClassName()}
                >
                  {contentPaperOptions.map((paper) => (
                    <option key={paper.id} value={paper.id}>
                      {paper.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Druck</span>
                <select
                  value={form.dInhaltKey}
                  onChange={(event) => updateForm('dInhaltKey', event.target.value)}
                  className={inputBaseClassName()}
                >
                  {druckOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.hasUmschlag}
                  onChange={(event) => updateForm('hasUmschlag', event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    Mit Umschlag
                  </span>
                  <span className="block text-sm text-slate-500">4 zusätzliche Seiten</span>
                </span>
              </label>

              {form.hasUmschlag && (
                <div className="space-y-4 rounded-2xl border-l-4 border-slate-900 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                    Umschlag
                  </p>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-slate-700">Papier</span>
                    <select
                      value={form.pUmschlagId}
                      onChange={(event) => updateForm('pUmschlagId', event.target.value)}
                      className={inputBaseClassName()}
                    >
                      {coverPaperOptions.map((paper) => (
                        <option key={paper.id} value={paper.id}>
                          {paper.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-slate-700">Druck</span>
                    <select
                      value={form.dUmschlagKey}
                      onChange={(event) => updateForm('dUmschlagKey', event.target.value)}
                      className={inputBaseClassName()}
                    >
                      {druckOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-slate-700">
                      Cellophanierung
                    </span>
                    <select
                      value={form.celloUmschlag}
                      onChange={(event) => updateForm('celloUmschlag', event.target.value)}
                      className={inputBaseClassName()}
                    >
                      {celloOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Produktionszeit</span>
                <select
                  value={form.produktionszeit}
                  onChange={(event) => updateForm('produktionszeit', event.target.value)}
                  className={inputBaseClassName()}
                >
                  <option value="standard">Standard</option>
                  <option value="express">Express (+10%)</option>
                </select>
              </label>

              <button
                type="button"
                onClick={handleCalculate}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Calculator className="h-4 w-4" />
                Preis berechnen
              </button>
            </div>
          </aside>

          <section className={panelClassName()}>
            <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-950 p-2 text-white">
                  <Calculator className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Kalkulierte Produktionswege
                  </h2>
                  <p className="text-sm text-slate-500">
                    Vergleich von Eigenproduktion und Partnern
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-6 sm:px-8">
              {!results && (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
                  <p className="text-sm italic text-slate-500">
                    Bitte Produktdaten eingeben und auf „Preis berechnen“ klicken.
                  </p>
                </div>
              )}

              {results && (
                <div className="grid gap-5 2xl:grid-cols-3 xl:grid-cols-2">
                  {results.map((result) => {
                    const isCheapest = !result.error && result.gesamt === cheapestPrice;
                    const isRecommended = !result.error && result.name === recommendedName;
                    const hasUm = result.bogenUmschlag > 0;

                    if (result.error) {
                      return (
                        <article
                          key={result.name}
                          className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-900"
                        >
                          <div className="mb-3 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <h3 className="font-semibold">{result.name}</h3>
                          </div>
                          <p className="text-sm leading-6">{result.error}</p>
                        </article>
                      );
                    }

                    return (
                      <article
                        key={result.name}
                        className={`rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                          isCheapest
                            ? 'border-emerald-400'
                            : isRecommended
                              ? 'border-amber-400'
                              : 'border-slate-200'
                        }`}
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900">
                              {result.name}
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {result.produktionszeit === 'express' ? 'Express' : 'Standard'} · {result.produktionszeitWT} Werktage
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {isRecommended && (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                Empfohlen
                              </span>
                            )}
                            {isCheapest && (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                Günstigste
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mb-5 flex items-start justify-between gap-4">
                          <div>
                            <p
                              className={`text-3xl font-bold tracking-tight ${
                                isCheapest ? 'text-emerald-600' : 'text-slate-900'
                              }`}
                            >
                              {fmt(result.gesamt)} €
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {fmt(result.stueckPreis, 4)} € / Stück
                            </p>
                          </div>

                          <div className="space-y-1 text-right text-xs text-slate-500">
                            <p>
                              DB Druck: {fmt(result.dbDruckInhalt, 3)}
                              {hasUm ? ` (I) · ${fmt(result.dbDruckUmschlag, 3)} (U)` : ''}
                            </p>
                            <p>
                              DB Papier: {fmt(result.dbPapierInhalt, 3)}
                              {hasUm ? ` (I) · ${fmt(result.dbPapierUmschlag, 3)} (U)` : ''}
                            </p>
                            <p>
                              Gew.-Zuschlag: {fmt(result.gewichtszuschlagInhalt, 3)} € (I)
                              {hasUm
                                ? ` · ${fmt(result.gewichtszuschlagUmschlag, 3)} € (U)`
                                : ''}
                            </p>
                            <p>
                              Makulatur: {result.makulaturInhalt} (I)
                              {hasUm ? ` · ${result.makulaturUmschlag} (U)` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                          <table className="w-full text-sm">
                            <tbody>
                              <DetailRow
                                label="Druck-Format"
                                value={`${result.formatName} · ${result.nutzen} Nutzen`}
                              />
                              <DetailRow
                                label="Bögen gesamt"
                                value={`${result.bogenInhalt + result.bogenUmschlag} Stk`}
                              />
                              <DetailRow
                                label="Gewicht / Stück"
                                value={fmtG(result.weightPerCopyG)}
                              />
                              <DetailRow
                                label="Gewicht Auflage"
                                value={fmtKg(result.weightTotalKg)}
                                withDivider
                              />
                              <DetailRow
                                label="Papierkosten"
                                value={`${fmt(result.kostenPapierGesamt)} €`}
                              />
                              {hasUm && (
                                <DetailSubRow
                                  value={`Inhalt ${fmt(result.kostenPapierInhalt)} € / Umschlag ${fmt(result.kostenPapierUmschlag)} €`}
                                />
                              )}
                              <DetailRow
                                label="Druckkosten"
                                value={`${fmt(result.kostenKlickGesamt)} €`}
                              />
                              {hasUm && (
                                <DetailSubRow
                                  value={`Inhalt ${fmt(result.kostenKlickInhalt)} € / Umschlag ${fmt(result.kostenKlickUmschlag)} €`}
                                />
                              )}
                              <DetailRow
                                label="Verarbeitung"
                                value={`${fmt(result.wvKosten)} €`}
                                withDivider
                              />
                              <DetailRow
                                label="Cellophanierung"
                                value={`${fmt(result.celloKosten)} €`}
                              />
                              <DetailSubRow
                                value={`${celloLabels[result.celloType] || 'Ohne'} · Grund ${fmt(result.celloGrundkosten)} € · Bogen ${fmt(result.celloBogenkosten)} € (${fmt(result.celloGrundkostenFaktor * 100, 0)}%)`}
                              />
                              <DetailRow
                                label="Einrichtekosten"
                                value={`${fmt(result.setupKosten)} €`}
                                withDivider={result.expressSurcharge === 0}
                              />
                              {result.expressSurcharge > 0 && (
                                <DetailRow
                                  label="Express-Aufschlag (+10%)"
                                  value={`${fmt(result.expressSurcharge)} €`}
                                  withDivider
                                />
                              )}
                              <tr className="border-t-2 border-slate-300 bg-slate-50">
                                <td className="px-4 py-3 font-semibold text-slate-900">
                                  Gesamt
                                </td>
                                <td
                                  className={`px-4 py-3 text-right font-bold ${
                                    isCheapest ? 'text-emerald-600' : 'text-slate-900'
                                  }`}
                                >
                                  {fmt(result.gesamt)} €
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, withDivider = false }) {
  return (
    <tr className={withDivider ? 'border-b border-slate-200' : ''}>
      <td className="px-4 py-2.5 text-slate-500">{label}</td>
      <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{value}</td>
    </tr>
  );
}

function DetailSubRow({ value }) {
  return (
    <tr>
      <td colSpan={2} className="px-4 pb-2 text-right text-xs italic text-slate-500">
        {value}
      </td>
    </tr>
  );
}