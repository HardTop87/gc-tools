import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import {
  blockToObjects,
  findBlock,
  objectsToBlockRows,
  parseLeadprintExport,
  serializeLeadprintExport,
} from './leadprintExportFile';

const BEISPIEL = 'Leadprint_Export/export_1112051233_BRO_RST.xlsx';

describe('Leadprint-Export: Blockstruktur lesen und verlustfrei zurückschreiben', () => {
  const synthetisch = [
    ['article.id', 'article.name'],
    [123, 'Test'],
    [],
    [],
    ['articlePrices.id', 'articlePrices.bezeichnung', 'articlePrices.preis', 'articlePrices.dynopt_aa.5628.16136'],
    [1, '1 Stück', 10.5, 0.4],
    [2, '10 Stück', 23, null],
  ];

  it('Roundtrip auf synthetischer Struktur ist zellidentisch (inkl. Leerzeilen)', () => {
    const model = parseLeadprintExport(synthetisch);
    expect(model.blocks).toHaveLength(2);
    expect(model.blocks[1].gapBefore).toBe(2);
    const zurueck = serializeLeadprintExport(model);
    // Zeilen normalisiert vergleichen — Trailing-Leerzellen tragen keine
    // Information und werden vom Parser bewusst abgeschnitten
    const norm = (row) => {
      const out = row.map((c) => (c === undefined ? null : c));
      while (out.length && out[out.length - 1] === null) out.pop();
      return out;
    };
    expect(zurueck.length).toBe(synthetisch.length);
    zurueck.forEach((row, i) => {
      expect(norm(row)).toEqual(norm(synthetisch[i]));
    });
  });

  it('findBlock/blockToObjects liefern die Preiszeilen als Objekte', () => {
    const model = parseLeadprintExport(synthetisch);
    const block = findBlock(model, 'articlePrices');
    const objekte = blockToObjects(block);
    expect(objekte[0]).toEqual({ id: 1, bezeichnung: '1 Stück', preis: 10.5, 'dynopt_aa.5628.16136': 0.4 });
    // Rückweg: unbekannte Felder bleiben leer, nie 0 (D1)
    const rows = objectsToBlockRows(block, [{ id: 9, preis: 5 }]);
    expect(rows[0]).toEqual([9, null, 5]);
  });

  it.skipIf(!fs.existsSync(BEISPIEL))(
    'Roundtrip auf einem echten Leadprint-Export ist zellidentisch (alle 360 Zeilen)',
    () => {
      const wb = XLSX.readFile(BEISPIEL);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const model = parseLeadprintExport(matrix);
      const zurueck = serializeLeadprintExport(model);

      // Beide Seiten gleich normalisieren (Trailing-null-Zellen abschneiden)
      const norm = (rows) =>
        rows.map((row) => {
          const out = [...row];
          while (out.length && (out[out.length - 1] === null || out[out.length - 1] === '')) out.pop();
          return out;
        });
      const soll = norm(matrix);
      const ist = norm(zurueck);
      // Trailing-Leerzeilen der Datei sind egal
      while (soll.length && soll[soll.length - 1].length === 0) soll.pop();
      while (ist.length && ist[ist.length - 1].length === 0) ist.pop();
      expect(ist.length).toBe(soll.length);
      ist.forEach((row, i) => expect(row, `Zeile ${i + 1}`).toEqual(soll[i]));

      // Plausibilität: die bekannten Blöcke sind da
      const preise = findBlock(model, 'articlePrices');
      expect(preise.rows).toHaveLength(84);
      expect(findBlock(model, 'article.')).not.toBeNull();
      expect(findBlock(model, 'articleGlobalVariety')).not.toBeNull();
    },
  );
});
