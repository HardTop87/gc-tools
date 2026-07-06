import { bogenpreis } from './pricingConfig';

// Statische Druckoptionen (nicht preisrelevant, daher nicht in der Config)
export const DRUCK_OPTIONS = [
  { value: '1c', label: '1/1 Schwarz-Weiß' },
  { value: '4c', label: '4/4 Farbig' },
];

function paperById(config, id) {
  return config.papiere.find((p) => p.id === id) ?? null;
}

function formatByKey(config, key) {
  return config.formate.find((f) => f.key === key) ?? null;
}

function getPapersByIds(config, ids) {
  return ids.map((id) => paperById(config, id)).filter(Boolean);
}

export function getFormatOptions(config) {
  return config.formate.map((f) => ({ value: f.key, label: f.name }));
}

export function getContentPaperOptions(config, formatKey) {
  const format = formatByKey(config, formatKey);
  if (!format) return [];
  return getPapersByIds(config, format.papiereInhalt);
}

// Familienregel: Umschlag muss aus derselben Papierfamilie stammen wie der Inhalt
// (CC↔CC, N↔N, BD↔BD, R↔R — bestätigt Armin/Guido 06.07.2026).
export function getCoverPaperOptions(config, formatKey, contentPaperId) {
  const format = formatByKey(config, formatKey);
  const contentPaper = paperById(config, contentPaperId);
  if (!format || !contentPaper) return [];
  return getPapersByIds(config, format.papiereUmschlag).filter(
    (paper) => paper.familie === contentPaper.familie,
  );
}

export function getCelloOptions(config, coverPaperId) {
  const coverPaper = paperById(config, coverPaperId);
  if (coverPaper && config.cello.erlaubteFamilien.includes(coverPaper.familie)) {
    return config.cello.arten.map((a) => ({ value: a.key, label: a.name }));
  }
  return [{ value: 'ohne', label: 'Ohne (nur bei CC/BD möglich)' }];
}

export function getCelloLabels(config) {
  return Object.fromEntries(config.cello.arten.map((a) => [a.key, a.name]));
}

export function getInitialRSTForm(config) {
  const initialFormat = config.formate[0]?.key ?? '';
  const contentOptions = getContentPaperOptions(config, initialFormat);
  const contentPaperId = contentOptions[0]?.id ?? '';
  const coverOptions = getCoverPaperOptions(config, initialFormat, contentPaperId);

  return {
    formatKey: initialFormat,
    auflage: '100',
    seiten: '24',
    pInhaltId: contentPaperId,
    dInhaltKey: '4c',
    hasUmschlag: false,
    pUmschlagId: coverOptions[0]?.id ?? '',
    dUmschlagKey: '4c',
    celloUmschlag: 'ohne',
    produktionszeit: 'standard',
  };
}

function numberOrDefault(value, fallback) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveSettings(config, overrides = null) {
  const resolved = { ...config.settings };
  if (overrides) {
    for (const key of Object.keys(resolved)) {
      if (overrides[key] !== undefined) {
        resolved[key] = numberOrDefault(overrides[key], resolved[key]);
      }
    }
  }
  return resolved;
}

// Seitenlimit aus Blattdicken (µm) und maximaler Broschürendicke der Route.
// Ersetzt die früheren statischen Limit-Tabellen (Spec Kap. 4).
export function calcMaxSeiten({ maxDicke, dickeInhalt, dickeUmschlag = 0 }) {
  if (!(maxDicke > 0) || !(dickeInhalt > 0)) return 0;
  const nutzbareDicke = maxDicke - (dickeUmschlag || 0);
  if (nutzbareDicke <= 0) return 0;
  return Math.floor(nutzbareDicke / dickeInhalt) * 4;
}

function getPriceFromTable(table, bogenteile, auflage) {
  const row = table[bogenteile];
  if (!row) return null;

  const keys = Object.keys(row).map(Number).sort((a, b) => a - b);

  // Exakter Treffer
  if (row[auflage] !== undefined) return row[auflage];

  // Sb = höchste Staffel ≤ ZS, Sa = niedrigste Staffel > ZS
  let sbW = null;
  let saW = null;
  for (const key of keys) {
    if (key < auflage) sbW = key;
    else if (key > auflage && saW === null) saW = key;
  }

  // ZS unter niedrigster Staffel → nicht angeboten
  if (sbW === null) return null;

  // ZS über höchster Staffel → Preis der höchsten Staffel
  if (saW === null) return row[keys[keys.length - 1]];

  // Lineare Interpolation: Px = (SaP - SbP) / (SaW - SbW) * (ZS - SbW) + SbP
  const sbP = row[sbW];
  const saP = row[saW];
  return (saP - sbP) / (saW - sbW) * (auflage - sbW) + sbP;
}

function resolveWvTable(config, route, isBanner, hasUmschlag) {
  const ref = route.wvTabelleRef;
  const name = typeof ref === 'string'
    ? ref
    : ref[`${isBanner ? 'banner' : 'standard'}_${hasUmschlag ? 'mit' : 'ohne'}`];
  return config.wvTabellen[name] ?? null;
}

function calcDeckungsbeitragDruck(anzahlBogen) {
  const n = Math.max(anzahlBogen, 1);
  return 1.5 + 4 / Math.pow(n, 0.15);
}

function calcDeckungsbeitragPapier(anzahlBogen) {
  const n = Math.max(anzahlBogen, 1);
  return 1.3 + 0.75 / Math.pow(n, 0.2);
}

function calcMakulatur(anzahlBogen) {
  const n = Math.max(anzahlBogen, 1);
  const shifted = n + 190.4668326232;
  const makulatur =
    3 +
    2.0092575059 / Math.pow(shifted, 0.08795607978) +
    1097.938962524 / shifted;
  return Math.ceil(makulatur);
}

function calcGewichtszuschlag(config, gsm) {
  const grammatur = Math.max(gsm, 0);
  let current = 0;

  for (const step of config.gewichtszuschlaege) {
    if (grammatur >= step.abGsm) {
      current = step.zuschlag;
    }
  }

  return current;
}

function normalizeCelloType(config, celloType) {
  return config.cello.arten.some((a) => a.key === celloType) ? celloType : 'ohne';
}

function calcCelloCosts({ config, settings, hasUmschlag, coverPaper, celloType, bogenUmschlag, isBanner }) {
  const allowed =
    hasUmschlag && Boolean(coverPaper) && config.cello.erlaubteFamilien.includes(coverPaper.familie);
  const normalizedType = normalizeCelloType(config, celloType);

  if (!allowed || normalizedType === 'ohne') {
    return {
      celloTypeEffektiv: 'ohne',
      celloGrundkosten: 0,
      celloBogenkosten: 0,
      celloStueckpreis: 0,
      celloKostenGesamt: 0,
    };
  }

  const basisStueckpreis = config.cello.arten.find((a) => a.key === normalizedType)?.stueckpreis ?? 0;
  // Banner-Formate: Bogen-Stückpreis × celloFaktorBanner (Grundkosten unverändert)
  const stueckpreis = basisStueckpreis * (isBanner ? settings.celloFaktorBanner : 1);
  const fixGrundkosten = Math.max(settings.celloGrundkosten, 0);
  const bogenkosten = bogenUmschlag * stueckpreis;

  return {
    celloTypeEffektiv: normalizedType,
    celloGrundkosten: fixGrundkosten,
    celloBogenkosten: bogenkosten,
    celloStueckpreis: stueckpreis,
    celloKostenGesamt: fixGrundkosten + bogenkosten,
  };
}

function calcSingleRoute(route, inputs, config, settings) {
  const { key, name, typ } = route;
  const {
    formatKey,
    auflage,
    seiten,
    pInhaltId,
    dInhaltKey,
    hasUmschlag,
    pUmschlagId,
    dUmschlagKey,
    celloUmschlag,
    produktionszeit,
  } = inputs;

  if (!route.formate.includes(formatKey)) {
    return { key, name, typ, error: 'Format wird von diesem Produzenten nicht unterstützt.' };
  }

  const format = formatByKey(config, formatKey);
  const bogenteile = seiten / 4;
  const bogenteileGesamt = hasUmschlag ? bogenteile + 1 : bogenteile;
  const contentPaper = paperById(config, pInhaltId);
  const coverPaper = hasUmschlag ? paperById(config, pUmschlagId) : null;

  if (!format || !contentPaper) {
    return { key, name, typ, error: 'Produktkonfiguration ist unvollständig.' };
  }

  if (!format.papiereInhalt.includes(contentPaper.id)) {
    return { key, name, typ, error: 'Inhaltspapier ist für dieses Format nicht zulässig.' };
  }

  if (hasUmschlag) {
    if (!coverPaper || !format.papiereUmschlag.includes(coverPaper.id)) {
      return { key, name, typ, error: 'Umschlagpapier ist ungültig oder für dieses Format nicht zulässig.' };
    }
    if (coverPaper.familie !== contentPaper.familie) {
      return {
        key,
        name,
        typ,
        error: 'Umschlag- und Inhaltspapier müssen aus derselben Papierfamilie stammen (CC/N/BD/R).',
      };
    }
  }

  if (route.minAuflage && auflage < route.minAuflage) {
    return { key, name, typ, error: `${name} ist erst ab ${route.minAuflage} Exemplaren möglich.` };
  }
  if (route.maxAuflage && auflage > route.maxAuflage) {
    return { key, name, typ, error: `${name} ist auf maximal ${route.maxAuflage} Exemplare begrenzt.` };
  }

  // Seitenlimit aus Blattdicken — gilt für alle Routen (Spec 4.2)
  const maxDicke = settings[route.maxDickeRef];
  const maxSeiten = calcMaxSeiten({
    maxDicke,
    dickeInhalt: contentPaper.dickeUm,
    dickeUmschlag: hasUmschlag ? coverPaper.dickeUm : 0,
  });
  if (maxSeiten < 8) {
    return { key, name, typ, error: 'Papierkombination technisch nicht möglich (Broschüre zu dick).' };
  }
  if (seiten > maxSeiten) {
    return {
      key,
      name,
      typ,
      error: `Technisch nicht möglich (max. ${maxSeiten} Seiten bei dieser Papierkombination).`,
    };
  }

  const nutzen = format[route.nutzenRef] ?? format.nutzenPartner;
  const isBanner = format.isBanner;
  const formatName = isBanner ? 'Banner' : 'SRA3';

  const klickBasis = {
    '1c': settings.baseGrundpreis1c,
    '4c': settings.baseGrundpreis4c,
  };
  const bannerFaktor = isBanner ? settings.dynFaktorBanner : 1;
  const currentKlickInhalt = klickBasis[dInhaltKey] * bannerFaktor;
  const currentKlickUmschlag = hasUmschlag ? klickBasis[dUmschlagKey] * bannerFaktor : 0;

  const bogenPreisInhalt = bogenpreis(contentPaper);
  const bogenPreisUmschlag = hasUmschlag ? bogenpreis(coverPaper) : 0;

  const nettoBogenInhalt = Math.ceil((auflage * bogenteile) / nutzen);
  const makulaturInhalt = calcMakulatur(nettoBogenInhalt);
  const bogenInhalt = nettoBogenInhalt + makulaturInhalt;

  const dbDruckInhalt = calcDeckungsbeitragDruck(nettoBogenInhalt);
  const dbPapierInhalt = calcDeckungsbeitragPapier(nettoBogenInhalt);

  let bogenUmschlag = 0;
  let makulaturUmschlag = 0;
  let nettoBogenUmschlag = 0;
  let dbDruckUmschlag = 0;
  let dbPapierUmschlag = 0;

  if (hasUmschlag) {
    nettoBogenUmschlag = Math.ceil(auflage / nutzen);
    makulaturUmschlag = calcMakulatur(nettoBogenUmschlag);
    bogenUmschlag = nettoBogenUmschlag + makulaturUmschlag;
    dbDruckUmschlag = calcDeckungsbeitragDruck(nettoBogenUmschlag);
    dbPapierUmschlag = calcDeckungsbeitragPapier(nettoBogenUmschlag);
  }

  const gewichtszuschlagInhalt = calcGewichtszuschlag(config, contentPaper.gsm);
  const klickpreisInhalt = (currentKlickInhalt + gewichtszuschlagInhalt) * dbDruckInhalt;

  const kostenPapierInhalt = bogenInhalt * bogenPreisInhalt * dbPapierInhalt;
  const kostenKlickInhalt = bogenInhalt * 2 * klickpreisInhalt;

  let kostenPapierUmschlag = 0;
  let kostenKlickUmschlag = 0;
  let gewichtszuschlagUmschlag = 0;

  if (hasUmschlag) {
    gewichtszuschlagUmschlag = calcGewichtszuschlag(config, coverPaper.gsm);
    const klickpreisUmschlag =
      (currentKlickUmschlag + gewichtszuschlagUmschlag) * dbDruckUmschlag;
    kostenPapierUmschlag = bogenUmschlag * bogenPreisUmschlag * dbPapierUmschlag;
    kostenKlickUmschlag = bogenUmschlag * 2 * klickpreisUmschlag;
  }

  const kostenPapierGesamt = kostenPapierInhalt + kostenPapierUmschlag;
  const kostenKlickGesamt = kostenKlickInhalt + kostenKlickUmschlag;
  const kostenDruckUndPapier = kostenPapierGesamt + kostenKlickGesamt;

  const {
    celloTypeEffektiv,
    celloGrundkosten,
    celloBogenkosten,
    celloStueckpreis,
    celloKostenGesamt,
  } = calcCelloCosts({
    config,
    settings,
    hasUmschlag,
    coverPaper,
    celloType: celloUmschlag,
    bogenUmschlag,
    isBanner,
  });

  // Umschlag-Zuschlag GC (Rillung/Umschlagverarbeitung Horizon, Spec 3.1)
  let umschlagZuschlag = 0;
  if (route.umschlagZuschlag && hasUmschlag && auflage >= settings.gcUmschlagAbAuflage) {
    umschlagZuschlag = settings.gcUmschlagGrundkosten + settings.gcUmschlagStueckpreis * auflage;
  }

  const gsmUmschlag = hasUmschlag ? coverPaper.gsm : 0;
  const sheetAreaM2 = (format.offenB * format.offenH) / 1_000_000;
  const weightPerCopyG =
    (bogenteile * contentPaper.gsm + (hasUmschlag ? 1 : 0) * gsmUmschlag) * sheetAreaM2;
  const weightTotalKg = (weightPerCopyG * auflage) / 1000;

  const wvTable = resolveWvTable(config, route, isBanner, hasUmschlag);
  if (!wvTable) {
    return { key, name, typ, error: 'Keine Verarbeitungspreistabelle für diese Konfiguration hinterlegt.' };
  }
  const wvKosten = getPriceFromTable(wvTable, bogenteileGesamt, auflage);
  if (wvKosten === null) {
    return { key, name, typ, error: `Auflage/Umfang bei ${name} nicht in Preistabelle hinterlegt.` };
  }

  const gesamtBase =
    kostenDruckUndPapier + wvKosten + celloKostenGesamt + umschlagZuschlag + settings.setupKosten;
  const isExpress = produktionszeit === 'express';
  const expressSurcharge = isExpress ? gesamtBase * settings.expressFaktor : 0;
  const gesamt = gesamtBase + expressSurcharge;
  const stueckPreis = gesamt / auflage;
  const produktionszeitWT = isExpress ? route.wtExpress : route.wtStandard;

  return {
    key,
    name,
    typ,
    error: null,
    gesamt,
    stueckPreis,
    produktionszeit: isExpress ? 'express' : 'standard',
    produktionszeitWT,
    expressSurcharge,
    formatName,
    nutzen,
    maxSeiten,
    nettoBogenInhalt,
    nettoBogenUmschlag,
    bogenInhalt,
    bogenUmschlag,
    kostenPapierGesamt,
    kostenKlickGesamt,
    kostenPapierInhalt,
    kostenKlickInhalt,
    kostenPapierUmschlag,
    kostenKlickUmschlag,
    dbDruckInhalt,
    dbDruckUmschlag,
    dbPapierInhalt,
    dbPapierUmschlag,
    gewichtszuschlagInhalt,
    gewichtszuschlagUmschlag,
    makulaturInhalt,
    makulaturUmschlag,
    celloKosten: celloKostenGesamt,
    celloGrundkosten,
    celloBogenkosten,
    celloStueckpreis,
    celloType: celloTypeEffektiv,
    umschlagZuschlag,
    setupKosten: settings.setupKosten,
    wvKosten,
    weightPerCopyG,
    weightTotalKg,
  };
}

// Prioritätsreihenfolge = Reihenfolge der Routen in der Config. Eine Route
// wird empfohlen, wenn sie höchstens um ihre Toleranz (settings[preferDeltaRef],
// z. B. preferInternDelta/preferKoppDelta) teurer ist als die günstigste der
// nachrangigen Routen; sonst rückt die nächste Route nach.
function pickRecommendedRouteName(validRoutes, config, settings) {
  if (!validRoutes.length) return null;

  const priority = config.routen.map((route) => route.key);
  const sorted = [...validRoutes].sort(
    (a, b) => priority.indexOf(a.key) - priority.indexOf(b.key),
  );

  for (let i = 0; i < sorted.length; i += 1) {
    const candidate = sorted[i];
    const lowerPriority = sorted.slice(i + 1);
    if (!lowerPriority.length) return candidate.name;

    const routeConfig = config.routen.find((route) => route.key === candidate.key);
    const delta = Number.isFinite(settings[routeConfig?.preferDeltaRef])
      ? settings[routeConfig.preferDeltaRef]
      : 0;
    const cheapestRest = Math.min(...lowerPriority.map((route) => route.gesamt));
    if (candidate.gesamt <= cheapestRest + delta) return candidate.name;
  }

  return sorted[sorted.length - 1].name;
}

export function calculateRSTPrice(formValues, config, settingsOverrides = null) {
  const typedInputs = {
    formatKey: formValues.formatKey,
    auflage: parseInt(formValues.auflage, 10) || 1,
    seiten: parseInt(formValues.seiten, 10) || 8,
    pInhaltId: formValues.pInhaltId,
    dInhaltKey: formValues.dInhaltKey,
    hasUmschlag: formValues.hasUmschlag,
    pUmschlagId: formValues.pUmschlagId,
    dUmschlagKey: formValues.dUmschlagKey,
    celloUmschlag: formValues.celloUmschlag,
    produktionszeit: formValues.produktionszeit === 'express' ? 'express' : 'standard',
  };

  const settings = resolveSettings(config, settingsOverrides);

  const results = config.routen.map((route) => calcSingleRoute(route, typedInputs, config, settings));
  const validResults = results.filter((result) => !result.error);
  const cheapestPrice = validResults.length
    ? Math.min(...validResults.map((result) => result.gesamt))
    : Infinity;

  return {
    results,
    validResults,
    cheapestPrice,
    recommendedName: pickRecommendedRouteName(validResults, config, settings),
  };
}
