import { describe, expect, it } from 'vitest';
import {
  RATES,
  autoDetectMapping,
  buildBegleitliste,
  buildRhaetiaCsv,
  cellStr,
  encodeWindows1252,
  formatPLZ,
  getExportAenderungen,
  getVersandArt,
  joinParts,
  labelPosition,
  normalizeCountryCode,
  parsePlzAndLand,
  resolveAddressFields,
  splitIntoBatches,
  splitStreetAndNumber,
  stripSenderRows,
  normalizeDbRow,
  mergeIntoDatabase,
  buildDatabaseCsv,
  toCsvCell,
  tokenizeName,
  matchNameTokens,
} from './postVersand';

const decode1252 = (bytes) => new TextDecoder('windows-1252').decode(bytes);

describe('Post-Manager: Zellwerte aus Excel', () => {
  it('cellStr macht aus Zahlen getrimmte Strings (PLZ/Hausnummer kommen als Number)', () => {
    expect(cellStr(80333)).toBe('80333');
    expect(cellStr(' München ')).toBe('München');
    expect(cellStr(undefined)).toBe('');
    expect(cellStr(null)).toBe('');
  });

  it('joinParts lässt undefined/null/leer weg — kein Text "undefined" im Matching', () => {
    expect(joinParts('Herr', undefined, 'Max', 'Mustermann', null)).toBe('Herr Max Mustermann');
    expect(tokenizeName(joinParts('Herr', undefined, 'Max', 'Mustermann', undefined))).toEqual(['max', 'mustermann']);
  });
});

describe('Post-Manager: Länder und PLZ', () => {
  it('normalisiert auf ISO-3, unbekannte Werte bleiben erhalten', () => {
    expect(normalizeCountryCode('de')).toBe('DEU');
    expect(normalizeCountryCode('Österreich')).toBe('AUT');
    expect(normalizeCountryCode('Frankreich')).toBe('FRA');
    expect(normalizeCountryCode('UK')).toBe('GBR');
    expect(normalizeCountryCode('Atlantis')).toBe('ATLANTIS');
    expect(normalizeCountryCode('')).toBe('');
  });

  it('füllt nur deutsche PLZ auf 5 Stellen auf', () => {
    expect(formatPLZ(1067, 'DEU')).toBe('01067');
    expect(formatPLZ('1067', 'Deutschland')).toBe('01067');
    expect(formatPLZ('1067', '')).toBe('01067');
    expect(formatPLZ('1012', 'NLD')).toBe('1012');
    expect(formatPLZ('1012', 'Niederlande')).toBe('1012'); // vorher wegen "DE" im Namen aufgefüllt
    expect(formatPLZ('1234', 'Schweden')).toBe('1234');
    expect(formatPLZ('80333', 'DEU')).toBe('80333');
    expect(formatPLZ('', 'DEU')).toBe('');
  });

  it('parsePlzAndLand trennt "80333 DEU" und fällt sonst auf das Land zurück', () => {
    expect(parsePlzAndLand('80333 DEU', 'AUT')).toEqual({ plz: '80333', land: 'DEU' });
    expect(parsePlzAndLand('1010', 'AT')).toEqual({ plz: '1010', land: 'AUT' });
    expect(parsePlzAndLand('', 'CH')).toEqual({ plz: '', land: 'CHE' });
  });
});

describe('Post-Manager: Porto', () => {
  it('staffelt Inland nach 20/50/500/1000 g', () => {
    expect(getVersandArt(20, 'DEU')).toMatchObject({ label: 'Standardbrief', price: RATES.de.standard });
    expect(getVersandArt(21, 'DEU')).toMatchObject({ label: 'Kompaktbrief', price: 1.10 });
    expect(getVersandArt(500, 'DEU')).toMatchObject({ label: 'Großbrief' });
    expect(getVersandArt(1000, 'DEU')).toMatchObject({ label: 'Maxibrief' });
    expect(getVersandArt(1001, 'DEU')).toMatchObject({ label: 'Paket', isDHL: true });
  });

  it('alles außer DEU ist international, auch ein leeres Land ist Inland', () => {
    expect(getVersandArt(10, 'AUT').label).toBe('Int. Standardbrief');
    expect(getVersandArt(10, 'Frankreich').price).toBe(RATES.intl.standard);
    expect(getVersandArt(10, '').label).toBe('Standardbrief');
  });
});

describe('Post-Manager: Adressfelder', () => {
  it('trennt Straße und Hausnummer', () => {
    expect(splitStreetAndNumber('Luisenstr. 27')).toEqual({ street: 'Luisenstr.', number: '27' });
    expect(splitStreetAndNumber('Straße des 17. Juni 135')).toEqual({ street: 'Straße des 17. Juni', number: '135' });
    expect(splitStreetAndNumber('Am Markt 3-5')).toEqual({ street: 'Am Markt', number: '3-5' });
    expect(splitStreetAndNumber('Hauptstraße')).toEqual({ street: 'Hauptstraße', number: '' });
  });

  it('resolveAddressFields lässt gesetzte Hausnummern in Ruhe und erkennt Postfach', () => {
    expect(resolveAddressFields({ strasse: 'Luisenstr. 27' })).toEqual({ strasse: 'Luisenstr.', nummer: '27', type: 'HOUSE' });
    expect(resolveAddressFields({ strasse: 'Luisenstr.', nummer: 27 })).toEqual({ strasse: 'Luisenstr.', nummer: '27', type: 'HOUSE' });
    expect(resolveAddressFields({ strasse: 'Postfach 12 34' })).toEqual({ strasse: 'Postfach', nummer: '12 34', type: 'POBOX' });
    expect(resolveAddressFields({ strasse: '', nummer: '' })).toEqual({ strasse: '', nummer: '', type: 'HOUSE' });
  });
});

describe('Post-Manager: Spalten-Erkennung', () => {
  it('kennt "Strasse" ohne ß und bevorzugt den exakten Header', () => {
    const m = autoDetectMapping(['Anrede', 'Vorname', 'Nachname', 'Strasse', 'PLZ', 'Ort', 'Bundesland', 'Land', 'Herold', 'Programm']);
    expect(m.strasse).toBe('Strasse');
    expect(m.land).toBe('Land');
    expect(m.ort).toBe('Ort');
    expect(m.titel).toBe('');
  });
});

describe('Post-Manager: Rhaetia-CSV', () => {
  const record = {
    name: 'Firma "Muster"', zusatz: 'Abt.; Vertrieb', strasse: 'Luisenstr.', nummer: 27,
    plz: 1067, ort: 'Dresden', landCode: 'DEU', type: 'HOUSE', hQty: 1, pQty: 0, totalWeight: 200,
  };

  it('toCsvCell entfernt Anführungszeichen und ersetzt Semikolon/Zeilenumbruch', () => {
    expect(toCsvCell('Firma "Muster"')).toBe('Firma Muster');
    expect(toCsvCell('Abt.; Vertrieb')).toBe('Abt. Vertrieb');
    expect(toCsvCell('-')).toBe('');
    expect(toCsvCell(27)).toBe('27');
  });

  it('baut Kopfzeile, Absender und bereinigte Datenzeile mit aufgefüllter PLZ', () => {
    const csv = buildRhaetiaCsv([record]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('NAME;ZUSATZ;STRASSE;NUMMER;PLZ;STADT;LAND;ADRESS_TYP');
    expect(lines[1].startsWith('K.B.St.V. Rhaetia;')).toBe(true);
    expect(lines[2]).toBe('Firma Muster;Abt. Vertrieb;Luisenstr.;27;01067;Dresden;DEU;HOUSE');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('Windows-1252: Umlaute und Euro bleiben, nicht darstellbare Zeichen werden "?"', () => {
    // Node decodiert 0x80–0x9F nicht wie der Browser, daher Bytes direkt prüfen.
    expect(Array.from(encodeWindows1252('ä€'))).toEqual([0xE4, 0x80]);
    expect(decode1252(encodeWindows1252('München'))).toBe('München');
    expect(decode1252(encodeWindows1252('Łukasz'))).toBe('?ukasz');
    expect(getExportAenderungen({ name: 'Łukasz', zusatz: 'A; B' })).toEqual({ ersetzt: true, bereinigt: true });
    expect(getExportAenderungen({ name: 'Müller' })).toEqual({ ersetzt: false, bereinigt: false });
  });
});

describe('Post-Manager: Begleitliste und Teillisten', () => {
  it('rechnet Etikettenposition ohne Absender: 12 pro Seite', () => {
    expect(labelPosition(1)).toEqual({ page: 1, pos: 1 });
    expect(labelPosition(12)).toEqual({ page: 1, pos: 12 });
    expect(labelPosition(13)).toEqual({ page: 2, pos: 1 });
  });

  it('listet nur Mehrfachempfänger, sonst null', () => {
    const one = { name: 'A', plz: '80333', ort: 'München', hQty: 1, pQty: 0, totalWeight: 200 };
    const multi = { name: 'B', plz: '80333', ort: 'München', hQty: 3, pQty: 0, totalWeight: 540 };
    expect(buildBegleitliste('Großbrief', [one])).toBeNull();
    const txt = buildBegleitliste('Großbrief', [one, multi]);
    expect(txt.split('\r\n')[0]).toBe('BEGLEITLISTE - Großbrief');
    expect(txt).toContain('S. 1, Pos. 2 | B | 80333 München | 3x Herold, 0x Prog | 540g');
    expect(txt).not.toContain('\n\n');
  });

  it('wirft den Absender aus einer als Datenbank geladenen Rhaetia-CSV', () => {
    const rows = [{ NAME: 'K.B.St.V. Rhaetia', PLZ: '80333' }, { NAME: 'Max Mustermann', PLZ: '80333' }];
    expect(stripSenderRows(rows).map((r) => r.NAME)).toEqual(['Max Mustermann']);
  });

  it('sortiert Mehrfachempfänger nach oben und teilt in 99er-Blöcke', () => {
    const records = Array.from({ length: 150 }, (_, i) => ({ name: `R${i}`, hQty: i === 149 ? 5 : 1, pQty: 0 }));
    const batches = splitIntoBatches(records);
    expect(batches.map((b) => b.length)).toEqual([99, 51]);
    expect(batches[0][0].name).toBe('R149');
  });
});

describe('Post-Manager: Datenbank für den nächsten Versand', () => {
  const alt = [
    { NAME: 'Max Mustermann', STRASSE: 'Altweg', NUMMER: '1', PLZ: 80333, STADT: 'München', LAND: 'DE' },
    { NAME: 'Erika Beispiel', STRASSE: 'Ring', NUMMER: '9', PLZ: '1067', ORT: 'Dresden', LAND: 'DEU' },
    { NAME: 'K.B.St.V. Rhaetia', STRASSE: 'Luisenstr.', NUMMER: '27', PLZ: '80333', STADT: 'München', LAND: 'DEU' },
  ];
  const versand = [
    { name: 'Max Mustermann', zusatz: '-', strasse: 'Neuweg', nummer: '5', plz: '80333', ort: 'München', landCode: 'DEU', type: 'HOUSE', label: 'Großbrief' },
    { name: 'Neu Dabei', zusatz: 'Bibliothek', strasse: 'Weg', nummer: '2', plz: '10115', ort: 'Berlin', landCode: 'DEU', type: 'HOUSE', label: 'Großbrief' },
    { name: 'Raus Genommen', strasse: 'X', nummer: '1', plz: '10115', ort: 'Berlin', landCode: 'DEU', label: 'Großbrief', excluded: true },
    { name: 'Kein Versand', strasse: '', plz: '', landCode: 'DEU', label: 'Kein Versand', errorMsg: 'Kein Versand (0 Stk)' },
  ];

  it('normalisiert Aliasse, PLZ und Land', () => {
    expect(normalizeDbRow(alt[1])).toEqual({ NAME: 'Erika Beispiel', ZUSATZ: '', STRASSE: 'Ring', NUMMER: '9', PLZ: '01067', STADT: 'Dresden', LAND: 'DEU', ADRESS_TYP: 'HOUSE' });
    expect(normalizeDbRow(alt[0]).LAND).toBe('DEU');
    expect(normalizeDbRow(alt[0]).PLZ).toBe('80333');
  });

  it('führt zusammen: aktuelle Adresse gewinnt, alte bleibt, Absender/ausgenommen/kein Versand fliegen raus', () => {
    const rows = mergeIntoDatabase(alt, versand);
    const names = rows.map((r) => r.NAME).sort();
    expect(names).toEqual(['Erika Beispiel', 'Max Mustermann', 'Neu Dabei']);
    const max = rows.find((r) => r.NAME === 'Max Mustermann');
    expect(max.STRASSE).toBe('Neuweg');
    expect(max.ZUSATZ).toBe('');
  });

  it('schreibt die Datenbank als Rhaetia-CSV ohne Absender', () => {
    const csv = buildDatabaseCsv(mergeIntoDatabase(alt, versand));
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('NAME;ZUSATZ;STRASSE;NUMMER;PLZ;STADT;LAND;ADRESS_TYP');
    expect(lines).toHaveLength(4);
    expect(lines.some((l) => l.startsWith('K.B.St.V. Rhaetia'))).toBe(false);
    expect(lines).toContain('Neu Dabei;Bibliothek;Weg;2;10115;Berlin;DEU;HOUSE');
  });
});

describe('Post-Manager: Namensvergleich ohne Beiwerk', () => {
  it('tokenizeName wirft Anreden, Titel und Berufe raus, lässt Namen ganz', () => {
    expect(tokenizeName('Herrn Prof. Dr. med. Max Mustermann, Rechtsanwalt')).toEqual(['max', 'mustermann']);
    expect(tokenizeName('Frau Dipl.-Ing. Erika Herrmann')).toEqual(['erika', 'herrmann']);
    expect(tokenizeName('Universitätsbibliothek Regensburg')).toEqual(['universitätsbibliothek', 'regensburg']);
  });

  it('matchNameTokens: Quelle mit Titeln gegen Datenbank mit Vor-/Nachname ist exakt', () => {
    const src = tokenizeName('Herr Dr. Max Mustermann, Rechtsanwalt');
    expect(matchNameTokens(src, tokenizeName('Max Mustermann')).status).toBe('exact');
    expect(matchNameTokens(src, tokenizeName('Mustermann, Max')).status).toBe('exact');
    expect(matchNameTokens(tokenizeName('Maximilian Mustermann'), tokenizeName('Max Mustermann')).status).toBe('exact');
    expect(matchNameTokens(tokenizeName('Erika Mustermann'), tokenizeName('Max Mustermann')).status).toBe('similar');
    expect(matchNameTokens(tokenizeName('Erika Beispiel'), tokenizeName('Max Mustermann')).status).toBe('mismatch');
    expect(matchNameTokens([], []).status).toBe('empty');
    expect(matchNameTokens(tokenizeName('Max'), []).status).toBe('mismatch');
  });
});
