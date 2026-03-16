import { PAPER_DATABASE, PRICING_CONFIG } from '../data/pricingData';

const { 
  allowedFormats,
  allowedPapers,
  cello,
  clicks,
  defaults,
  formats,
  processingPrices,
  routes,
  limits,
} = PRICING_CONFIG;

function findPaperById(id) {
  const paper = PAPER_DATABASE[id] ?? null;
  if (!paper) return null;
  return {
    id,
    name: paper.name,
    gsm: paper.gsm,
    category: paper.category,
    pricePerSheet: paper.pricePerSheet,
  };
}

function getPapersByIds(ids) {
  return ids
    .map((id) => findPaperById(id))
    .filter((paper) => paper !== null);
}

export function getContentPaperOptions(formatKey) {
  const isBanner = formats[formatKey]?.isBanner ?? false;
  const ids = isBanner ? allowedPapers.inhaltBanner : allowedPapers.inhalt;
  return getPapersByIds(ids);
}

export function getCoverPaperOptions(formatKey, contentPaperId) {
  const contentPaper = findPaperById(contentPaperId);
  if (!contentPaper) return [];

  const isBanner = formats[formatKey]?.isBanner ?? false;
  const ids = isBanner ? allowedPapers.umschlagBanner : allowedPapers.umschlag;

  return getPapersByIds(ids).filter(
    (paper) => paper.category === contentPaper.category,
  );
}

export function getCelloOptions(coverPaperId) {
  const coverPaper = findPaperById(coverPaperId);
  const category = coverPaper?.category;

  if (category === 'CC' || category === 'BD') {
    return [
      { value: 'ohne', label: 'Ohne Cellophanierung' },
      { value: 'glaenzend', label: 'Glänzend' },
      { value: 'matt', label: 'Matt / kratzfest' },
      { value: 'softtouch', label: 'Softtouch' },
    ];
  }

  return [{ value: 'ohne', label: 'Ohne (nur bei CC/BD möglich)' }];
}

export function getInitialRSTForm() {
  const initialFormat = defaults.form.formatKey;
  const contentOptions = getContentPaperOptions(initialFormat);
  const contentPaperId = contentOptions[0]?.id ?? '';
  const coverOptions = getCoverPaperOptions(initialFormat, contentPaperId);

  return {
    ...defaults.form,
    pInhaltId: contentPaperId,
    pUmschlagId: coverOptions[0]?.id ?? '',
  };
}

function numberOrDefault(value, fallback) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getLimitsForFormat(formatKey) {
  switch (formatKey) {
    case 'A4_Hoch':
    case 'A5_Quer':
      return limits.a4;
    case 'A5_Hoch':
      return limits.a5;
    case 'A4_Quer':
    case '30x30':
      return limits.banner;
    default:
      return { noCover: {}, withCover: {} };
  }
}

function getPriceFromTable(table, bogenteile, auflage) {
  if (table[bogenteile] && table[bogenteile][auflage]) {
    return table[bogenteile][auflage];
  }
  return null;
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

function calcGewichtszuschlag(gsm) {
  const grammatur = Math.max(gsm, 0);
  let current = 0;

  for (const step of clicks.weightSurcharges) {
    if (grammatur >= step.minGsm) {
      current = step.zuschlag;
    }
  }

  return current;
}

function normalizeCelloType(celloType) {
  if (celloType === 'glaenzend' || celloType === 'matt' || celloType === 'softtouch') {
    return celloType;
  }
  return 'ohne';
}

function isCelloAllowedForPaper(paper) {
  return Boolean(paper) && cello.allowedCategories.includes(paper.category);
}

function getCelloMengenFaktor(bogenUmschlag) {
  const menge = Math.max(bogenUmschlag, 0);
  let current = 0;

  for (const step of cello.quantityFactors) {
    if (menge >= step.minBogen) {
      current = step.faktor;
    }
  }

  return current;
}

function calcCelloCosts({ hasUmschlag, coverPaper, celloType, bogenUmschlag, grundkosten }) {
  const allowed = hasUmschlag && isCelloAllowedForPaper(coverPaper);
  const normalizedType = normalizeCelloType(celloType);

  if (!allowed || normalizedType === 'ohne') {
    return {
      celloTypeEffektiv: 'ohne',
      celloGrundkosten: 0,
      celloGrundkostenFaktor: 0,
      celloBogenkosten: 0,
      celloStueckpreis: 0,
      celloKostenGesamt: 0,
    };
  }

  const faktor = getCelloMengenFaktor(bogenUmschlag);
  const stueckpreis = cello.unitPrices[normalizedType] ?? 0;
  const effektiverBogenpreis = stueckpreis * faktor;
  const fixGrundkosten = Math.max(grundkosten, 0);
  const bogenkosten = bogenUmschlag * effektiverBogenpreis;

  return {
    celloTypeEffektiv: normalizedType,
    celloGrundkosten: fixGrundkosten,
    celloGrundkostenFaktor: faktor,
    celloBogenkosten: bogenkosten,
    celloStueckpreis: effektiverBogenpreis,
    celloKostenGesamt: fixGrundkosten + bogenkosten,
  };
}

function calcSingleRoute(route, inputs, settings) {
  const { name, isIntern } = route;
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
  } = inputs;

  if (!allowedFormats[name].includes(formatKey)) {
    return { name, error: 'Format wird von diesem Produzenten nicht unterstützt.' };
  }

  const formatSettings = formats[formatKey];
  const bogenteile = seiten / 4;
  const bogenteileGesamt = hasUmschlag ? bogenteile + 1 : bogenteile;
  const contentPaper = findPaperById(pInhaltId);
  const coverPaper = hasUmschlag ? findPaperById(pUmschlagId) : null;

  if (!formatSettings || !contentPaper) {
    return { name, error: 'Produktkonfiguration ist unvollständig.' };
  }

  if (hasUmschlag && !coverPaper) {
    return { name, error: 'Umschlagpapier ist ungültig.' };
  }

  const klickSRA3 = {
    '1c': settings.baseGrundpreis1c,
    '4c': settings.baseGrundpreis4c,
  };
  const klickSRA4 = {
    '1c': settings.baseGrundpreis1c * settings.dynFaktorKlickSRA4,
    '4c': settings.baseGrundpreis4c * settings.dynFaktorKlickSRA4,
  };

  let nutzen = formatSettings.nutzenPartner;
  let formatName = 'SRA3';
  let bogenPreisInhalt = contentPaper.pricePerSheet;
  let bogenPreisUmschlag = hasUmschlag ? coverPaper.pricePerSheet : 0;
  let currentKlickInhalt = klickSRA3[dInhaltKey];
  let currentKlickUmschlag = hasUmschlag ? klickSRA3[dUmschlagKey] : 0;

  if (formatSettings.isBanner) {
    formatName = 'Banner';
    currentKlickInhalt *= settings.dynFaktorBanner;
    currentKlickUmschlag = hasUmschlag
      ? currentKlickUmschlag * settings.dynFaktorBanner
      : 0;
  } else if (isIntern) {
    nutzen = 1;

    if (formatKey === 'A5_Hoch') {
      formatName = 'SRA4';
      bogenPreisInhalt = contentPaper.pricePerSheet / 2;
      bogenPreisUmschlag = hasUmschlag ? coverPaper.pricePerSheet / 2 : 0;
      currentKlickInhalt = klickSRA4[dInhaltKey];
      currentKlickUmschlag = hasUmschlag ? klickSRA4[dUmschlagKey] : 0;
    }
  }

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

  const gsmInhalt = contentPaper.gsm;
  const gewichtszuschlagInhalt = calcGewichtszuschlag(gsmInhalt);
  const klickpreisInhalt = (currentKlickInhalt + gewichtszuschlagInhalt) * dbDruckInhalt;

  const kostenPapierInhalt = bogenInhalt * bogenPreisInhalt * dbPapierInhalt;
  const kostenKlickInhalt = bogenInhalt * 2 * klickpreisInhalt;

  let kostenPapierUmschlag = 0;
  let kostenKlickUmschlag = 0;
  let gewichtszuschlagUmschlag = 0;

  if (hasUmschlag) {
    const gsmUmschlag = coverPaper.gsm;
    gewichtszuschlagUmschlag = calcGewichtszuschlag(gsmUmschlag);
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
    celloGrundkostenFaktor,
    celloBogenkosten,
    celloStueckpreis,
    celloKostenGesamt,
  } = calcCelloCosts({
    hasUmschlag,
    coverPaper,
    celloType: celloUmschlag,
    bogenUmschlag,
    grundkosten: settings.celloGrundkosten,
  });

  const gsmUmschlag = hasUmschlag ? coverPaper.gsm : 0;
  const [openW, openH] = formatSettings.openMm;
  const sheetAreaM2 = (openW * openH) / 1_000_000;
  const weightPerCopyG =
    (bogenteile * gsmInhalt + (hasUmschlag ? 1 : 0) * gsmUmschlag) * sheetAreaM2;
  const weightTotalKg = (weightPerCopyG * auflage) / 1000;

  const { noCover, withCover } = getLimitsForFormat(formatKey);

  let maxSeiten = 0;
  if (!hasUmschlag) {
    maxSeiten = noCover[contentPaper.id] || 0;
  } else if (withCover[coverPaper.id] && withCover[coverPaper.id][contentPaper.id]) {
    maxSeiten = withCover[coverPaper.id][contentPaper.id];
  }

  let wvKosten = null;
  let errorMsg = '';

  if (isIntern) {
    if (maxSeiten === 0) {
      errorMsg = 'Technisches Limit für diese Papierkombi bei diesem Format nicht definiert.';
    } else if (seiten > maxSeiten) {
      errorMsg = `Technisch nicht möglich (Maschinenlimit: ${maxSeiten} Seiten).`;
    } else {
      wvKosten = getPriceFromTable(processingPrices.intern, bogenteileGesamt, auflage);
      if (wvKosten === null) {
        errorMsg = 'Auflage/Umfang für Eigenproduktion nicht in Preistabelle hinterlegt.';
      }
    }
  } else {
    if (formatSettings.isBanner) {
      if (maxSeiten === 0) {
        errorMsg = 'Papierkombination für dieses Banner-Format nicht zulässig.';
      } else if (seiten > maxSeiten) {
        errorMsg = `Technisch nicht möglich (Limit für schweres Banner-Format: ${maxSeiten} Seiten).`;
      }
    }

    if (errorMsg === '') {
      if (name === 'Partner Kopp') {
        wvKosten = getPriceFromTable(processingPrices.kopp, bogenteileGesamt, auflage);
        if (wvKosten === null) {
          errorMsg = 'Von Kopp für diese Auflage/Umfang nicht in Tabelle hinterlegt.';
        }
      } else if (name === 'Partner ILDA') {
        const table = hasUmschlag
          ? processingPrices.ilda.withCover
          : processingPrices.ilda.withoutCover;
        wvKosten = getPriceFromTable(table, bogenteileGesamt, auflage);
        if (wvKosten === null) {
          errorMsg = 'Von ILDA für diese Auflage/Umfang nicht in Tabelle hinterlegt.';
        }
      }
    }
  }

  if (errorMsg) {
    return { name, error: errorMsg };
  }

  const gesamt = kostenDruckUndPapier + wvKosten + celloKostenGesamt + settings.setupKosten;
  const stueckPreis = gesamt / auflage;

  return {
    name,
    error: null,
    gesamt,
    stueckPreis,
    formatName,
    nutzen,
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
    celloGrundkostenFaktor,
    celloStueckpreis,
    celloType: celloTypeEffektiv,
    setupKosten: settings.setupKosten,
    wvKosten,
    weightPerCopyG,
    weightTotalKg,
  };
}

function pickRecommendedRouteName(validRoutes, settings) {
  if (!validRoutes.length) return null;

  const preferInternDelta = Number.isFinite(settings.preferInternDelta)
    ? settings.preferInternDelta
    : 20;
  const preferKoppDelta = Number.isFinite(settings.preferKoppDelta)
    ? settings.preferKoppDelta
    : 30;

  const intern = validRoutes.find((route) => route.name.includes('Intern'));
  const kopp = validRoutes.find((route) => route.name.includes('Kopp'));
  const ilda = validRoutes.find((route) => route.name.includes('ILDA'));
  const extern = validRoutes.filter((route) => !route.name.includes('Intern'));
  const cheapestExternal = extern.length
    ? extern.reduce((best, route) => (route.gesamt < best.gesamt ? route : best), extern[0])
    : null;

  if (intern && cheapestExternal) {
    if (intern.gesamt <= cheapestExternal.gesamt + preferInternDelta) {
      return intern.name;
    }
  } else if (intern) {
    return intern.name;
  }

  if (kopp && ilda) {
    if (kopp.gesamt <= ilda.gesamt + preferKoppDelta) {
      return kopp.name;
    }
    return ilda.name;
  }

  if (kopp) return kopp.name;
  if (ilda) return ilda.name;

  return validRoutes.reduce(
    (best, route) => (route.gesamt < best.gesamt ? route : best),
    validRoutes[0],
  ).name;
}

export function calculateRSTPrice(formValues, settingsValues = defaults.settings) {
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
  };

  const typedSettings = {
    baseGrundpreis1c: numberOrDefault(
      settingsValues.baseGrundpreis1c,
      clicks.defaultBasePrices['1c'],
    ),
    baseGrundpreis4c: numberOrDefault(
      settingsValues.baseGrundpreis4c,
      clicks.defaultBasePrices['4c'],
    ),
    dynFaktorBanner: numberOrDefault(settingsValues.dynFaktorBanner, 1.5),
    dynFaktorKlickSRA4: numberOrDefault(settingsValues.dynFaktorKlickSRA4, 0.7),
    celloGrundkosten: numberOrDefault(settingsValues.celloGrundkosten, 20),
    setupKosten: numberOrDefault(settingsValues.setupKosten, 15),
    preferInternDelta: numberOrDefault(settingsValues.preferInternDelta, 20),
    preferKoppDelta: numberOrDefault(settingsValues.preferKoppDelta, 30),
  };

  const results = routes.map((route) => calcSingleRoute(route, typedInputs, typedSettings));
  const validResults = results.filter((result) => !result.error);
  const cheapestPrice = validResults.length
    ? Math.min(...validResults.map((result) => result.gesamt))
    : Infinity;

  return {
    results,
    validResults,
    cheapestPrice,
    recommendedName: pickRecommendedRouteName(validResults, typedSettings),
  };
}