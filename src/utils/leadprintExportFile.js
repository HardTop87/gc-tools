// Leadprint-Export-Dateien (be.print Druckshop): EIN Worksheet, sequenzielle
// Blöcke aus Header-Zeile (`prefix.feldname`, …) + Datenzeile(n), getrennt durch
// Leerzeilen (Analyse: Leadprint-Mapper-Konzept.md Kap. 1.2).
//
// Dieses Modul ist der struktur-generische Grundstein des Import-Writers: Es
// zerlegt eine Export-Datei verlustfrei in Blöcke und setzt sie identisch
// wieder zusammen — WELCHE Optionsspalten ein Block hat, ist ihm egal. Damit
// bleibt es gültig, wenn der neue Backend-Export (mit den 8 RST-Optionsfeldern)
// eine andere Spaltenbelegung mitbringt; nur die Befüllung ändert sich.
//
// Arbeitsbasis ist eine Array-of-Arrays-Matrix (Zeile → Zellwerte), wie sie
// `XLSX.utils.sheet_to_json(ws, { header: 1 })` liefert — so bleibt das Modul
// frei von Datei-I/O und in Tests ohne Browser nutzbar.

function istLeereZeile(row) {
  return !row || row.every((cell) => cell === null || cell === undefined || cell === '');
}

function trimmeZeile(row) {
  const out = [...(row ?? [])];
  while (out.length && (out[out.length - 1] === null || out[out.length - 1] === undefined || out[out.length - 1] === '')) {
    out.pop();
  }
  return out.map((cell) => (cell === undefined ? null : cell));
}

// Zerlegt die Matrix in Blöcke. Rückgabe: Liste von
//   { prefix, header: [feldnamen], rows: [[werte…]], gapBefore }
// `gapBefore` = Anzahl Leerzeilen vor dem Block (für den verlustfreien
// Rückweg). Der prefix ist der Teil vor dem ersten Punkt der ersten
// Header-Zelle (z. B. "articlePrices", "article_dynopt_aa.5628" bleibt als
// voller Header erhalten — prefix dient nur dem Auffinden).
export function parseLeadprintExport(matrix) {
  const blocks = [];
  let gap = 0;
  let i = 0;
  while (i < matrix.length) {
    if (istLeereZeile(matrix[i])) {
      gap += 1;
      i += 1;
      continue;
    }
    const header = trimmeZeile(matrix[i]);
    const erste = String(header[0] ?? '');
    const prefix = erste.includes('.') ? erste.slice(0, erste.indexOf('.')) : erste;
    const rows = [];
    i += 1;
    while (i < matrix.length && !istLeereZeile(matrix[i])) {
      rows.push(trimmeZeile(matrix[i]));
      i += 1;
    }
    blocks.push({ prefix, header, rows, gapBefore: gap });
    gap = 0;
  }
  return { blocks, trailingGap: gap };
}

// Setzt das Blockmodell wieder zu einer Matrix zusammen — bei unverändertem
// Modell zellidentisch zur Eingabe (Roundtrip-Garantie, per Test gesichert).
export function serializeLeadprintExport(model) {
  const matrix = [];
  for (const block of model.blocks) {
    for (let g = 0; g < block.gapBefore; g += 1) matrix.push([]);
    matrix.push([...block.header]);
    for (const row of block.rows) matrix.push([...row]);
  }
  for (let g = 0; g < (model.trailingGap ?? 0); g += 1) matrix.push([]);
  return matrix;
}

// Erster Block, dessen erste Header-Zelle mit `prefix` beginnt (z. B.
// "articlePrices" oder "article_dynopt_aa.5628").
export function findBlock(model, prefix) {
  return model.blocks.find((block) => String(block.header[0] ?? '').startsWith(prefix)) ?? null;
}

// Datenzeilen eines Blocks als Objekte {feldname: wert} — Feldnamen ohne den
// gemeinsamen Prefix ("articlePrices.preis" → "preis").
export function blockToObjects(block) {
  const felder = block.header.map((name) => {
    const s = String(name ?? '');
    return s.includes('.') ? s.slice(s.indexOf('.') + 1) : s;
  });
  return block.rows.map((row) => {
    const obj = {};
    felder.forEach((feld, index) => {
      obj[feld] = row[index] ?? null;
    });
    return obj;
  });
}

// Ersetzt die Datenzeilen eines Blocks aus Objekten; Reihenfolge und Umfang
// der Spalten bestimmt weiterhin der Header der Datei. Felder, die ein Objekt
// nicht kennt, bleiben leer (null) — nie 0 (Entscheidung D1: leere Zelle =
// Option im Shop ausgeblendet).
export function objectsToBlockRows(block, objects) {
  const felder = block.header.map((name) => {
    const s = String(name ?? '');
    return s.includes('.') ? s.slice(s.indexOf('.') + 1) : s;
  });
  return objects.map((obj) =>
    trimmeZeile(felder.map((feld) => (obj[feld] === undefined ? null : obj[feld]))),
  );
}
