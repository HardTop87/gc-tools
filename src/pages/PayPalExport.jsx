import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  FileUp,
  Link2,
  RefreshCcw,
  Square,
  SquareCheck,
  Trash2,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const TAB_KEYS = {
  perfect: 'perfect',
  station: 'station',
  missingPaypal: 'missingPaypal',
};

const MONEY_EPSILON = 0.005;

const SHOP_COLUMN_KEYS = {
  orderNo: ['auftragsnummer', 'bestellnummer', 'orderid', 'ordernumber'],
  invoiceNo: ['rechnungsnummer', 'invoicenumber', 'invoiceid'],
  gross: ['gesamtpreisbrutto', 'preisgesamtpreisbrutto', 'gesamtpreis', 'brutto', 'betrag'],
  mwst: ['mwst', 'mehrwertsteuer', 'ustsatz'],
  paymentType: ['bezahlung', 'zahlungsart', 'zahlungsweise', 'payment', 'paymentmethod'],
  customerFirstName: ['rgvorname', 'vorname', 'firstname', 'kundevorname'],
  customerLastName: ['rgnachname', 'nachname', 'lastname', 'kundenachname'],
  customerName: ['kunde', 'kundenname', 'name'],
  companyName: ['rgfirma', 'firma', 'firmenname'],
  vatId: ['rgumsatzsteuerid', 'umsatzsteuerid', 'ustid', 'ust-id'],
  country: ['rgland', 'land', 'country'],
};

const PAYPAL_COLUMN_KEYS = {
  orderNo: ['zollnummer', 'auftragsnummer', 'invoiceid', 'rechnung', 'bestellnummer'],
  gross: ['brutto', 'gross'],
  fee: ['gebuhr', 'paypalgebuhr', 'fee'],
  net: ['netto', 'net'],
  transactionCode: ['transaktionscode', 'transaktionsid', 'transactionid', 'belegnummer'],
  date: ['datum', 'date'],
  type: ['typ', 'type'],
  customerName: ['name', 'zahlervonname', 'customername'],
  country: ['land', 'country'],
};

function normalizeHeader(rawHeader) {
  return String(rawHeader ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeText(rawText) {
  return String(rawText ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeToken(rawText) {
  return normalizeText(rawText).replace(/\s+/g, '');
}

function buildNormalizedRow(row) {
  return Object.entries(row || {}).reduce((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    return acc;
  }, {});
}

function findCellValue(row, candidates) {
  for (const key of candidates) {
    const val = row[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return val;
    }
  }
  return '';
}

export function parseCurrency(val) {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }

  if (val === null || val === undefined) {
    return 0;
  }

  let str = String(val).trim();
  if (!str) {
    return 0;
  }

  const hasParenthesis = /^\(.*\)$/.test(str);
  str = str
    .replace(/^\((.*)\)$/, '$1')
    .replace(/eur/gi, '')
    .replace(/€/g, '')
    .replace(/\s+/g, '')
    .replace(/'/g, '')
    .replace(/[^0-9,.-]/g, '');

  if (!str || str === '-' || str === ',' || str === '.') {
    return 0;
  }

  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1) {
    const pieces = str.split('.');
    if (pieces.length > 2) {
      const decimalPart = pieces.pop();
      str = `${pieces.join('')}.${decimalPart}`;
    } else if (pieces.length === 2 && pieces[1].length === 3) {
      str = pieces.join('');
    }
  }

  const parsed = Number.parseFloat(str);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return hasParenthesis ? -Math.abs(parsed) : parsed;
}

function parseDateToIso(value) {
  if (!value) {
    return '';
  }

  const raw = String(value).trim();
  if (!raw) {
    return '';
  }

  const slashFormat = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (slashFormat) {
    const day = slashFormat[1].padStart(2, '0');
    const month = slashFormat[2].padStart(2, '0');
    const year = slashFormat[3].length === 2 ? `20${slashFormat[3]}` : slashFormat[3];
    return `${year}-${month}-${day}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateGerman(value) {
  const raw = String(value || '').trim();
  // Already in DD.MM.YYYY format – return as-is to preserve the dots exactly
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    return raw;
  }
  const iso = parseDateToIso(raw);
  if (!iso.includes('-')) {
    return raw || '';
  }
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function formatNumberGerman(value) {
  if (!Number.isFinite(value)) {
    return '0,00';
  }
  return value.toFixed(2).replace('.', ',');
}

function hasSameAmount(a, b) {
  return Math.abs(a - b) < MONEY_EPSILON;
}

function parseMwstRate(value) {
  const parsed = Math.abs(parseCurrency(value));
  if (Math.abs(parsed - 19) < MONEY_EPSILON) {
    return 19;
  }
  if (Math.abs(parsed - 7) < MONEY_EPSILON) {
    return 7;
  }
  return 0;
}

function getGegenkontoFromMwst(mwstRate, isManual = false) {
  if (isManual) {
    return '8405';
  }
  if (mwstRate === 19) {
    return '8405';
  }
  if (mwstRate === 7) {
    return '8305';
  }
  return '8405';
}

function sumGross(rows, key = 'gross') {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row[key]) ? row[key] : 0), 0);
}

async function parseUploadedFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'xlsx' || extension === 'xls') {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  }

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: '',
      complete: (results) => resolve(results.data || []),
      error: (error) => reject(error),
    });
  });
}

function parseShopRows(rawRows) {
  const seenInvoiceNumbers = new Set();

  return rawRows
    .map((row, index) => {
      const normalized = buildNormalizedRow(row);
      const paymentType = normalizeToken(findCellValue(normalized, SHOP_COLUMN_KEYS.paymentType));
      if (paymentType !== 'paypal' && paymentType !== 'paypalapi') {
        return null;
      }

      const orderNo = String(findCellValue(normalized, SHOP_COLUMN_KEYS.orderNo)).trim();
      const invoiceNo = String(findCellValue(normalized, SHOP_COLUMN_KEYS.invoiceNo)).trim();
      const gross = parseCurrency(findCellValue(normalized, SHOP_COLUMN_KEYS.gross));
      const mwstRaw = findCellValue(normalized, SHOP_COLUMN_KEYS.mwst);
      const mwstRate = parseMwstRate(mwstRaw);

      const firstName = String(findCellValue(normalized, SHOP_COLUMN_KEYS.customerFirstName)).trim();
      const lastName = String(findCellValue(normalized, SHOP_COLUMN_KEYS.customerLastName)).trim();
      const combinedName = `${firstName} ${lastName}`.trim();
      const customerName =
        combinedName || String(findCellValue(normalized, SHOP_COLUMN_KEYS.customerName)).trim() || 'Unbekannt';
      const companyName = String(findCellValue(normalized, SHOP_COLUMN_KEYS.companyName)).trim();
      const vatId = String(findCellValue(normalized, SHOP_COLUMN_KEYS.vatId)).trim();
      const country = String(findCellValue(normalized, SHOP_COLUMN_KEYS.country)).trim();

      if (!invoiceNo && !orderNo && !gross) {
        return null;
      }

      if (invoiceNo) {
        if (seenInvoiceNumbers.has(invoiceNo)) {
          return null;
        }
        seenInvoiceNumbers.add(invoiceNo);
      }

      return {
        id: `shop-${index}`,
        orderNo,
        invoiceNo,
        gross,
        customerName,
        firstName,
        lastName,
        companyName,
        vatId,
        country,
        mwstRate,
      };
    })
    .filter(Boolean);
}

function parsePayPalRows(rawRows) {
  return rawRows
    .map((row, index) => {
      const normalized = buildNormalizedRow(row);
      const type = String(findCellValue(normalized, PAYPAL_COLUMN_KEYS.type)).trim();
      const normalizedType = normalizeText(type);

      if (normalizedType === 'allgemeine abbuchung') {
        return null;
      }

      const orderNo = String(findCellValue(normalized, PAYPAL_COLUMN_KEYS.orderNo)).trim();
      const gross = parseCurrency(findCellValue(normalized, PAYPAL_COLUMN_KEYS.gross));
      const fee = parseCurrency(findCellValue(normalized, PAYPAL_COLUMN_KEYS.fee));
      const net = parseCurrency(findCellValue(normalized, PAYPAL_COLUMN_KEYS.net));
      const date = String(findCellValue(normalized, PAYPAL_COLUMN_KEYS.date)).trim();
      const transactionCode = String(findCellValue(normalized, PAYPAL_COLUMN_KEYS.transactionCode)).trim();
      const customerName = String(findCellValue(normalized, PAYPAL_COLUMN_KEYS.customerName)).trim() || 'Unbekannt';
      const country = String(findCellValue(normalized, PAYPAL_COLUMN_KEYS.country)).trim();

      if (!orderNo && !transactionCode && !gross) {
        return null;
      }

      return {
        id: `paypal-${index}`,
        orderNo,
        gross,
        fee,
        net,
        date,
        type,
        transactionCode,
        customerName,
        country,
      };
    })
    .filter(Boolean);
}

function makeMatchedRecord(shop, paypal, matchType, forcedOrderNo = '') {
  const orderNo = forcedOrderNo || shop?.orderNo || shop?.invoiceNo || paypal.orderNo || '';
  const isManual = !shop;
  const fallbackInvoiceNo = shop?.invoiceNo || paypal.orderNo || 'Ohne_Beleg';

  return {
    id: `${shop?.id || 'manual'}-${paypal.id}-${matchType}`,
    matchType,
    orderNo,
    invoiceNo: fallbackInvoiceNo,
    customerName: shop?.customerName || paypal.customerName,
    paypalGross: paypal.gross,
    paypalFee: paypal.fee,
    paypalNet: paypal.net,
    transactionCode: paypal.transactionCode,
    date: paypal.date,
    firstName: shop?.firstName || '',
    lastName: shop?.lastName || '',
    companyName: shop?.companyName || '',
    vatId: shop?.vatId || '',
    country: shop?.country || paypal.country || '',
    mwstRate: shop?.mwstRate ?? 0,
    isManual,
  };
}

function runMatching(shopRows, paypalRows) {
  const unmatchedShopMap = new Map(shopRows.map((row) => [row.id, row]));
  const unmatchedPayPalMap = new Map(paypalRows.map((row) => [row.id, row]));
  const paypalByOrderNo = new Map();
  const matched = [];

  for (const paypal of paypalRows) {
    if (!paypal.orderNo) {
      continue;
    }
    if (!paypalByOrderNo.has(paypal.orderNo)) {
      paypalByOrderNo.set(paypal.orderNo, []);
    }
    paypalByOrderNo.get(paypal.orderNo).push(paypal);
  }

  // Stage 1: Zollnummer == Auftragsnummer and exact gross amount.
  for (const shop of shopRows) {
    if (!shop.orderNo) {
      continue;
    }

    const candidates = (paypalByOrderNo.get(shop.orderNo) || []).filter((paypal) => unmatchedPayPalMap.has(paypal.id));
    const exact = candidates.find((paypal) => hasSameAmount(paypal.gross, shop.gross));

    if (!exact) {
      continue;
    }

    matched.push(makeMatchedRecord(shop, exact, 'stage1'));
    unmatchedShopMap.delete(shop.id);
    unmatchedPayPalMap.delete(exact.id);
  }

  // Stage 2: PayPal name contains shop last name and exact gross amount.
  for (const shop of Array.from(unmatchedShopMap.values())) {
    const lastName = normalizeText(shop.lastName);
    if (!lastName) {
      continue;
    }

    const candidate = Array.from(unmatchedPayPalMap.values()).find((paypal) => {
      if (!hasSameAmount(paypal.gross, shop.gross)) {
        return false;
      }
      return normalizeText(paypal.customerName).includes(lastName);
    });

    if (!candidate) {
      continue;
    }

    matched.push(makeMatchedRecord(shop, candidate, 'stage2'));
    unmatchedShopMap.delete(shop.id);
    unmatchedPayPalMap.delete(candidate.id);
  }

  return {
    matched,
    unmatchedShop: Array.from(unmatchedShopMap.values()),
    unmatchedPayPal: Array.from(unmatchedPayPalMap.values()),
  };
}

function buildDatevExportRows(matchedRows) {
  return matchedRows.map((row) => {
    const mwstRate = row.isManual ? 19 : row.mwstRate || 0;
    const gegenkonto = getGegenkontoFromMwst(mwstRate, row.isManual);
    const fullName = row.firstName || row.lastName ? `${row.firstName || ''} ${row.lastName || ''}`.trim() : row.customerName;
    const rechnungsnummer = row.isManual ? 'Manueller_Beleg' : row.invoiceNo || row.orderNo || '';

    return {
      'Gesamt-Bruttowert': formatNumberGerman(row.paypalGross),
      'Soll Haben': 'S',
      Gegenkonto: gegenkonto,
      Rechnungsnummer: rechnungsnummer,
      Rechnungsdatum: formatDateGerman(row.date),
      'Kundennummer/-buchungskonto': '1260',
      'Vorname/Nachname': fullName || '',
      Firmenname: row.companyName || '',
      'Ust-ID': row.vatId || '',
      Bezahlung: 'PayPal',
      Gutschein: '0',
      Land: row.country || '',
      'MwSt-Satz': String(mwstRate),
      Festschreibung: '0',
    };
  });
}

function aggregateMatchedRows(matchedRows) {
  const result = [];
  const grouped = new Map();

  for (const row of matchedRows) {
    if (row.isManual) {
      // Manueller_Beleg-Einträge werden nie zusammengefasst
      result.push(row);
      continue;
    }
    const key = row.invoiceNo || row.orderNo || '';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  }

  for (const group of grouped.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    // Ältestes Datum zuerst (ISO-Sortierung)
    const sorted = [...group].sort((a, b) => parseDateToIso(a.date).localeCompare(parseDateToIso(b.date)));
    const base = sorted[0];
    const totalGross = group.reduce((sum, r) => sum + r.paypalGross, 0);
    result.push({ ...base, paypalGross: totalGross });
  }

  return result;
}

function TabButton({ label, count, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-xs font-black uppercase tracking-wide transition-all ${
        isActive
          ? 'border-[#8e014d] bg-[#8e014d] text-white shadow-md'
          : 'border-gray-200 bg-white text-gray-600 hover:border-[#8e014d]/30 hover:text-[#8e014d]'
      }`}
    >
      {label} ({count})
    </button>
  );
}

function UploadDropzone({ title, subtitle, onFileSelect, accept }) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) {
          onFileSelect(file);
        }
      }}
      className={`block cursor-pointer rounded-2xl border-2 border-dashed p-6 transition-all ${
        isDragging
          ? 'border-[#8e014d] bg-[#fdf2f8]'
          : 'border-gray-200 bg-white hover:border-[#8e014d]/30 hover:bg-[#fdf2f8]/40'
      }`}
    >
      <input
        type="file"
        className="hidden"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFileSelect(file);
          }
        }}
      />
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#8e014d]/15 bg-[#fdf2f8] text-[#8e014d]">
          <FileUp size={20} />
        </div>
        <div>
          <p className="text-sm font-black text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
    </label>
  );
}

function RowCheck({ checked, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-[#8e014d] transition-colors hover:text-[#6c013a]">
      {checked ? <SquareCheck size={18} /> : <Square size={18} />}
    </button>
  );
}

export default function PayPalExport() {
  const [shopFileName, setShopFileName] = useState('');
  const [payPalFileName, setPayPalFileName] = useState('');
  const [targetSumInput, setTargetSumInput] = useState('');
  const [shopRows, setShopRows] = useState([]);
  const [payPalRows, setPayPalRows] = useState([]);
  const [reconciliation, setReconciliation] = useState(null);
  const [initialStats, setInitialStats] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_KEYS.perfect);
  const [error, setError] = useState('');
  const [selectedShopIds, setSelectedShopIds] = useState([]);
  const [selectedPayPalIds, setSelectedPayPalIds] = useState([]);
  const [excludedShopIds, setExcludedShopIds] = useState([]);

  const hasBothFiles = shopRows.length > 0 && payPalRows.length > 0;

  useEffect(() => {
    if (!hasBothFiles) {
      setReconciliation(null);
      setInitialStats(null);
      return;
    }

    setInitialStats({
      shopTotal: sumGross(shopRows),
      paypalTotal: sumGross(payPalRows),
    });
    setReconciliation(runMatching(shopRows, payPalRows));
    setSelectedShopIds([]);
    setSelectedPayPalIds([]);
    setExcludedShopIds([]);
  }, [hasBothFiles, shopRows, payPalRows]);

  const kassensturzPayPalSum = useMemo(() => sumGross(payPalRows), [payPalRows]);
  const targetSum = parseCurrency(targetSumInput);
  const sollLautShop = useMemo(() => sumGross(shopRows), [shopRows]);

  const unresolvedShopVisible = useMemo(() => {
    if (!reconciliation) {
      return [];
    }
    return reconciliation.unmatchedShop.filter((row) => !excludedShopIds.includes(row.id));
  }, [reconciliation, excludedShopIds]);

  const selectedShops = unresolvedShopVisible.filter((row) => selectedShopIds.includes(row.id));
  const selectedPayPals = (reconciliation?.unmatchedPayPal || []).filter((row) => selectedPayPalIds.includes(row.id));

  const selectedShopSum = useMemo(() => sumGross(selectedShops), [selectedShops]);
  const selectedPayPalSum = useMemo(() => sumGross(selectedPayPals), [selectedPayPals]);

  const liveStats = useMemo(() => {
    const matchedList = reconciliation?.matched || [];
    const unmatchedShopOrders = reconciliation?.unmatchedShop || [];
    const unmatchedPayPalTransactions = reconciliation?.unmatchedPayPal || [];

    const matchedTotal = sumGross(matchedList, 'paypalGross');
    const openShopTotal = sumGross(unmatchedShopOrders);
    const openPayPalTotal = sumGross(unmatchedPayPalTransactions);
    const liveShopTotal = matchedTotal + openShopTotal;
    const livePayPalTotal = matchedTotal + openPayPalTotal;

    return {
      matchedTotal,
      openShopTotal,
      openPayPalTotal,
      liveShopTotal,
      livePayPalTotal,
      liveGap: liveShopTotal - matchedTotal,
      liveDiff: livePayPalTotal - liveShopTotal,
    };
  }, [reconciliation]);

  const kassensturzDiff = (liveStats.livePayPalTotal || kassensturzPayPalSum) - targetSum;
  const kassensturzBalanced = Math.abs(kassensturzDiff) < MONEY_EPSILON;

  const canCombine = selectedShops.length === 1 && selectedPayPals.length >= 1;
  const canPartial = selectedShops.length === 1 && selectedPayPals.length === 1;
  const canIgnoreShop = selectedShops.length === 1;
  const canDiscardPayPal = selectedPayPals.length >= 1;
  const canAdoptPayPalWithoutShop = selectedPayPals.length >= 1 && selectedShops.length === 0;

  const handleShopFile = async (file) => {
    setError('');
    try {
      const rows = await parseUploadedFile(file);
      setShopRows(parseShopRows(rows));
      setShopFileName(file.name);
    } catch {
      setError('Shop-Datei konnte nicht gelesen werden. Bitte CSV oder Excel pruefen.');
    }
  };

  const handlePayPalFile = async (file) => {
    setError('');
    try {
      const rows = await parseUploadedFile(file);
      setPayPalRows(parsePayPalRows(rows));
      setPayPalFileName(file.name);
    } catch {
      setError('PayPal-Datei konnte nicht gelesen werden. Bitte CSV oder Excel pruefen.');
    }
  };

  const resetAll = () => {
    setShopFileName('');
    setPayPalFileName('');
    setTargetSumInput('');
    setShopRows([]);
    setPayPalRows([]);
    setReconciliation(null);
    setInitialStats(null);
    setActiveTab(TAB_KEYS.perfect);
    setError('');
    setSelectedShopIds([]);
    setSelectedPayPalIds([]);
    setExcludedShopIds([]);
  };

  const toggleSelectedShop = (id) => {
    setSelectedShopIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const toggleSelectedPayPal = (id) => {
    setSelectedPayPalIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const clearSelections = () => {
    setSelectedShopIds([]);
    setSelectedPayPalIds([]);
  };

  const assignSelectedPayPalsToShop = (mode) => {
    if (!canCombine) {
      return;
    }

    const shop = selectedShops[0];
    const selectedPayPalSet = new Set(selectedPayPals.map((row) => row.id));

    setReconciliation((prev) => {
      if (!prev) {
        return prev;
      }

      const newMatches = selectedPayPals.map((paypal) => makeMatchedRecord(shop, paypal, mode));
      return {
        matched: [...prev.matched, ...newMatches],
        unmatchedShop: prev.unmatchedShop.filter((row) => row.id !== shop.id),
        unmatchedPayPal: prev.unmatchedPayPal.filter((row) => !selectedPayPalSet.has(row.id)),
      };
    });

    clearSelections();
  };

  const acceptPartialPayment = () => {
    if (!canPartial) {
      return;
    }
    assignSelectedPayPalsToShop('manual-partial');
  };

  const ignoreSelectedShop = () => {
    if (!canIgnoreShop) {
      return;
    }

    const shopId = selectedShops[0].id;
    setReconciliation((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        matched: prev.matched,
        unmatchedShop: prev.unmatchedShop.filter((row) => row.id !== shopId),
        unmatchedPayPal: prev.unmatchedPayPal,
      };
    });

    setExcludedShopIds((prev) => prev.filter((id) => id !== shopId));
    setSelectedShopIds([]);
  };

  const discardSelectedPayPals = () => {
    if (!canDiscardPayPal) {
      return;
    }

    const selectedSet = new Set(selectedPayPals.map((row) => row.id));
    setReconciliation((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        matched: prev.matched,
        unmatchedShop: prev.unmatchedShop,
        unmatchedPayPal: prev.unmatchedPayPal.filter((row) => !selectedSet.has(row.id)),
      };
    });

    setSelectedPayPalIds([]);
  };

  const adoptSelectedPayPalsWithoutShop = () => {
    if (!canAdoptPayPalWithoutShop) {
      return;
    }

    const selectedSet = new Set(selectedPayPals.map((row) => row.id));
    setReconciliation((prev) => {
      if (!prev) {
        return prev;
      }

      const adoptedMatches = selectedPayPals.map((paypal) =>
        makeMatchedRecord(null, paypal, 'manual-pass-through', paypal.orderNo || 'Ohne_Beleg'),
      );

      return {
        matched: [...prev.matched, ...adoptedMatches],
        unmatchedShop: prev.unmatchedShop,
        unmatchedPayPal: prev.unmatchedPayPal.filter((row) => !selectedSet.has(row.id)),
      };
    });

    clearSelections();
  };

  const excludeShopFromExport = (id) => {
    setExcludedShopIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSelectedShopIds((prev) => prev.filter((entry) => entry !== id));
  };

  const exportCsv = () => {
    if (!reconciliation) {
      return;
    }

    const aggregated = aggregateMatchedRows(reconciliation.matched).sort((a, b) => {
      const keyA = a.isManual ? '' : a.invoiceNo || a.orderNo || '';
      const keyB = b.isManual ? '' : b.invoiceNo || b.orderNo || '';
      // Manueller_Beleg ans Ende
      if (a.isManual && !b.isManual) return 1;
      if (!a.isManual && b.isManual) return -1;
      const numA = Number(keyA);
      const numB = Number(keyB);
      if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
      return keyA.localeCompare(keyB, 'de');
    });
    const rows = buildDatevExportRows(aggregated);
    if (rows.length === 0) {
      setError('Keine verifizierten Matches für den Export vorhanden.');
      return;
    }

    const csv = Papa.unparse(rows, {
      delimiter: ';',
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      columns: [
        'Gesamt-Bruttowert',
        'Soll Haben',
        'Gegenkonto',
        'Rechnungsnummer',
        'Rechnungsdatum',
        'Kundennummer/-buchungskonto',
        'Vorname/Nachname',
        'Firmenname',
        'Ust-ID',
        'Bezahlung',
        'Gutschein',
        'Land',
        'MwSt-Satz',
        'Festschreibung',
      ],
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${new Date().toISOString().split('T')[0]}_PayPal_Reconciliation.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#8e014d] transition-colors hover:text-[#c2185b]"
        >
          <ArrowLeft size={16} /> Dashboard
        </Link>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-xl md:p-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">PayPal Reconciliation Tool</h1>
            <p className="mt-1 text-sm text-gray-500">
              Automatischer Soll-Ist-Abgleich mit interaktiver Klärungs-Station für Teilzahlungen und Quittungen.
            </p>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-gray-600 transition-all hover:border-[#8e014d]/40 hover:text-[#8e014d]"
          >
            <RefreshCcw size={14} /> Reset
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <UploadDropzone
            title="Dropzone 1: Shop Export CSV/Excel"
            subtitle={
              shopFileName
                ? `Geladen: ${shopFileName}`
                : 'Filtert nur Bezahlung = PayPal / PayPalApi und dedupliziert nach Rechnungsnummer'
            }
            onFileSelect={handleShopFile}
            accept=".csv,.xls,.xlsx"
          />
          <UploadDropzone
            title="Dropzone 2: PayPal CSV"
            subtitle={
              payPalFileName
                ? `Geladen: ${payPalFileName}`
                : 'Filtert Typ = Allgemeine Abbuchung aus und bereitet Brutto/Gebühr/Netto auf'
            }
            onFileSelect={handlePayPalFile}
            accept=".csv,.xls,.xlsx"
          />
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm">
            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-600">
              Zielsumme laut PayPal-Kontoauszug PDF
            </label>
            <input
              type="text"
              value={targetSumInput}
              onChange={(event) => setTargetSumInput(event.target.value)}
              placeholder="z.B. 12.345,67"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 outline-none ring-[#8e014d]/20 transition-all focus:border-[#8e014d] focus:ring"
            />
            <p className="mt-2 text-xs text-gray-500">Manueller Kontrollwert für den Kassensturz.</p>
          </div>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!hasBothFiles && (
          <div className="mt-8 rounded-2xl border border-[#8e014d]/15 bg-[#fdf2f8] px-5 py-4 text-sm text-[#8e014d]">
            Lade Shop-Export und PayPal-Datei hoch. Der Abgleich startet automatisch.
          </div>
        )}

        {reconciliation && (
          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="rounded-2xl border border-[#8e014d]/10 bg-gradient-to-r from-[#fff6fb] via-[#fff] to-[#fff6fb] p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-[#8e014d]">Kassensturz (PayPal)</p>
                <p className="mt-2 text-sm text-gray-600">Ausgangsstand vs. Live-Stand und Zielsumme PDF</p>
                <div className="mt-4 space-y-1 text-sm">
                  <p className="font-semibold text-gray-600">
                    Ausgang PayPal: {formatNumberGerman(initialStats?.paypalTotal ?? kassensturzPayPalSum)} EUR
                  </p>
                  <p className="font-semibold text-gray-600">
                    Live PayPal: {formatNumberGerman(liveStats.livePayPalTotal || kassensturzPayPalSum)} EUR
                  </p>
                  <p className="font-semibold text-gray-600">Zielsumme PDF: {formatNumberGerman(targetSum)} EUR</p>
                </div>
                <p className={`mt-3 text-lg font-black ${kassensturzBalanced ? 'text-emerald-600' : 'text-red-600'}`}>
                  Differenz: {formatNumberGerman(kassensturzDiff)} EUR
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-[#8e014d]">Matching-Status</p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[10px] font-black uppercase text-gray-500">Ausgang Shop</p>
                    <p className="mt-1 text-sm font-black text-gray-800">
                      {formatNumberGerman(initialStats?.shopTotal ?? sollLautShop)} EUR
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[10px] font-black uppercase text-gray-500">Live Gematcht</p>
                    <p className="mt-1 text-sm font-black text-gray-800">{formatNumberGerman(liveStats.matchedTotal)} EUR</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[10px] font-black uppercase text-gray-500">Verbleibende Differenz</p>
                    <p className="mt-1 text-sm font-black text-amber-700">{formatNumberGerman(liveStats.liveDiff)} EUR</p>
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold text-gray-500">
                  Offener Shop-Betrag: {formatNumberGerman(liveStats.openShopTotal)} EUR | Offenes PayPal: {formatNumberGerman(liveStats.openPayPalTotal)} EUR
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton
                label="✅ Perfekte Matches"
                count={reconciliation.matched.length}
                isActive={activeTab === TAB_KEYS.perfect}
                onClick={() => setActiveTab(TAB_KEYS.perfect)}
              />
              <TabButton
                label="⚠️ Klärungs-Station"
                count={reconciliation.unmatchedShop.length + reconciliation.unmatchedPayPal.length}
                isActive={activeTab === TAB_KEYS.station}
                onClick={() => setActiveTab(TAB_KEYS.station)}
              />
              <TabButton
                label="❌ Fehlt in PayPal"
                count={unresolvedShopVisible.length}
                isActive={activeTab === TAB_KEYS.missingPaypal}
                onClick={() => setActiveTab(TAB_KEYS.missingPaypal)}
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {activeTab === TAB_KEYS.perfect && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] divide-y divide-gray-100 text-left text-sm">
                    <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Auftragsnummer / Beleg</th>
                        <th className="px-4 py-3">Kunde</th>
                        <th className="px-4 py-3">Brutto</th>
                        <th className="px-4 py-3">PayPal Gebuehr</th>
                        <th className="px-4 py-3">PayPal Netto</th>
                        <th className="px-4 py-3">Datum (PayPal)</th>
                        <th className="px-4 py-3">Code</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {reconciliation.matched.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            Noch keine Matches vorhanden.
                          </td>
                        </tr>
                      )}
                      {reconciliation.matched.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3 font-bold text-gray-800">{row.orderNo || '-'}</td>
                          <td className="px-4 py-3 text-gray-700">{row.customerName}</td>
                          <td className="px-4 py-3 text-gray-700">{formatNumberGerman(row.paypalGross)} EUR</td>
                          <td className="px-4 py-3 text-gray-700">{formatNumberGerman(row.paypalFee)} EUR</td>
                          <td className="px-4 py-3 text-gray-700">{formatNumberGerman(row.paypalNet)} EUR</td>
                          <td className="px-4 py-3 text-gray-700">{formatDateGerman(row.date)}</td>
                          <td className="px-4 py-3 text-gray-700">{row.transactionCode || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === TAB_KEYS.station && (
                <div className="space-y-4 p-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 p-3">
                      <p className="mb-3 text-xs font-black uppercase tracking-wide text-gray-600">
                        Ungeloste Shop-Aufträge
                      </p>
                      <div className="max-h-[320px] overflow-auto rounded-lg border border-gray-100">
                        {unresolvedShopVisible.length === 0 && (
                          <p className="p-4 text-sm text-gray-500">Keine offenen Shop-Aufträge.</p>
                        )}
                        {unresolvedShopVisible.map((row) => (
                          <div key={row.id} className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-0">
                            <RowCheck checked={selectedShopIds.includes(row.id)} onClick={() => toggleSelectedShop(row.id)} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-800">
                                {row.orderNo || row.invoiceNo || '-'}
                              </p>
                              <p className="truncate text-xs text-gray-500">{row.customerName}</p>
                            </div>
                            <p className="ml-auto text-xs font-black text-gray-700">{formatNumberGerman(row.gross)} EUR</p>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!canIgnoreShop}
                        onClick={ignoreSelectedShop}
                        className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                          canIgnoreShop
                            ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                            : 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                      >
                        <Trash2 size={14} /> Als Storno/Vorkasse verwerfen
                      </button>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-3">
                      <p className="mb-3 text-xs font-black uppercase tracking-wide text-gray-600">
                        Ungeloste PayPal-Zahlungen
                      </p>
                      <div className="max-h-[320px] overflow-auto rounded-lg border border-gray-100">
                        {reconciliation.unmatchedPayPal.length === 0 && (
                          <p className="p-4 text-sm text-gray-500">Keine offenen PayPal-Zahlungen.</p>
                        )}
                        {reconciliation.unmatchedPayPal.map((row) => (
                          <div key={row.id} className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-0">
                            <RowCheck
                              checked={selectedPayPalIds.includes(row.id)}
                              onClick={() => toggleSelectedPayPal(row.id)}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-800">{row.customerName}</p>
                              <p className="truncate text-xs text-gray-500">{row.orderNo || row.transactionCode || '-'}</p>
                            </div>
                            <p className="ml-auto text-xs font-black text-gray-700">{formatNumberGerman(row.gross)} EUR</p>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!canDiscardPayPal}
                        onClick={discardSelectedPayPals}
                        className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                          canDiscardPayPal
                            ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                            : 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                      >
                        <Trash2 size={14} /> Fehlbuchung verwerfen
                      </button>
                      <button
                        type="button"
                        disabled={!canAdoptPayPalWithoutShop}
                        onClick={adoptSelectedPayPalsWithoutShop}
                        className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                          canAdoptPayPalWithoutShop
                            ? 'border border-[#8e014d]/30 bg-[#fdf2f8] text-[#8e014d] hover:bg-[#fce7f3]'
                            : 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                      >
                        <CheckCircle2 size={14} /> Als Manuellen Beleg uebernehmen
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-100 p-4 rounded-xl flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm font-black text-slate-700">
                      Summe Shop: <span className="text-[#8e014d]">{formatNumberGerman(selectedShopSum)} EUR</span>
                    </p>
                    <p className="text-sm font-black text-slate-700">
                      Summe PayPal: <span className="text-[#8e014d]">{formatNumberGerman(selectedPayPalSum)} EUR</span>
                    </p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <button
                      type="button"
                      disabled={!canCombine}
                      onClick={() => assignSelectedPayPalsToShop('manual-combined')}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wide transition-all ${
                        canCombine
                          ? 'bg-[#8e014d] text-white hover:bg-[#70013d]'
                          : 'cursor-not-allowed bg-gray-100 text-gray-400'
                      }`}
                    >
                      <Link2 size={14} /> Zusammenfassen & Zuweisen
                    </button>

                    <button
                      type="button"
                      disabled={!canPartial}
                      onClick={acceptPartialPayment}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wide transition-all ${
                        canPartial
                          ? 'bg-[#8e014d] text-white hover:bg-[#70013d]'
                          : 'cursor-not-allowed bg-gray-100 text-gray-400'
                      }`}
                    >
                      <WalletCards size={14} /> Als Teilzahlung akzeptieren (Rest Bar)
                    </button>
                  </div>
                </div>
              )}

              {activeTab === TAB_KEYS.missingPaypal && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] divide-y divide-gray-100 text-left text-sm">
                    <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Rechnungsnummer</th>
                        <th className="px-4 py-3">Auftragsnummer</th>
                        <th className="px-4 py-3">Kunde</th>
                        <th className="px-4 py-3">Brutto</th>
                        <th className="px-4 py-3">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {unresolvedShopVisible.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            Keine offenen Shop-Aufträge ohne PayPal-Match.
                          </td>
                        </tr>
                      )}
                      {unresolvedShopVisible.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3 font-bold text-gray-800">{row.invoiceNo || '-'}</td>
                          <td className="px-4 py-3 text-gray-700">{row.orderNo || '-'}</td>
                          <td className="px-4 py-3 text-gray-700">{row.customerName}</td>
                          <td className="px-4 py-3 text-gray-700">{formatNumberGerman(row.gross)} EUR</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => excludeShopFromExport(row.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-600 transition-all hover:border-gray-300"
                            >
                              <XCircle size={14} /> Aus Export ausschliessen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
              <div className="flex items-start gap-3 text-sm text-gray-600">
                <FileCheck2 size={18} className="mt-0.5 text-[#8e014d]" />
                <div>
                  <p className="font-semibold text-gray-800">Finaler Export enthält nur verifizierte Matches.</p>
                  <p>Automatische Matches + manuell geklärte Zuordnungen + manuelle Quittungen.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-xl bg-[#8e014d] px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg transition-all hover:bg-[#70013d]"
              >
                <Download size={15} /> Exportieren (CSV)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#8e014d]" />
          <p>
            Datensätze sind strikt exklusiv: Jede Buchung liegt zu jedem Zeitpunkt nur in Matches, unmatched Shop oder unmatched PayPal.
          </p>
        </div>
      </div>
    </div>
  );
}
