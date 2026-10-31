// Erzeugt Leadprint-Uebersicht.md aus dem Shop-Katalog (leadprintShop.json),
// der pricingConfig (Dicke, Grammatur, Preis je 1000) und dem RST-Mapping.
// Die Übersicht wird nicht gepflegt, sondern erzeugt — sie ist nie eine
// eigene Quelle.
//   npx vite-node scripts/leadprintUebersicht.mjs [ziel.md]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import katalog from '../src/data/leadprintShop.json' with { type: 'json' };
import mapping from '../src/data/leadprintMapping.rst.json' with { type: 'json' };
import { getDefaultPricingConfig } from '../src/utils/pricingConfig';
import { sorteByRechnerKey } from '../src/utils/leadprintShop';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ziel = process.argv[2] ?? path.join(repoRoot, 'Leadprint-Uebersicht.md');
const config = getDefaultPricingConfig();
const papierById = new Map(config.papiere.map((p) => [p.id, p]));
const artikelNr = new Map(katalog.artikel.map((a) => [a.id, a.artikelnummer]));

const eur = (v) => (v == null ? '' : v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const tabelle = (kopf, zeilen) => [
  `| ${kopf.join(' | ')} |`,
  `|${kopf.map(() => '---').join('|')}|`,
  ...zeilen.map((z) => `| ${z.map((c) => String(c ?? '')).join(' | ')} |`),
].join('\n');

// Verwendung je Rechner-Papier: Inhalt/Umschlag in welchen Formaten
const verwendung = new Map();
for (const f of config.formate) {
  for (const id of f.papiereInhalt) verwendung.set(id, [...(verwendung.get(id) ?? []), `Inhalt ${f.key}`]);
  for (const id of f.papiereUmschlag) verwendung.set(id, [...(verwendung.get(id) ?? []), `Umschlag ${f.key}`]);
}

// „aktiv in Artikeln“ lesbar: abgelöste Alt-Artikel ausblenden, vollständige
// Produktsätze zusammenfassen statt 16 Artikelnummern aufzuzählen.
const aktiveIds = new Set(katalog.artikel.map((a) => a.id));
const rstIds = katalog.artikel.filter((a) => a.produkt === 'rst').map((a) => a.id);
function aktivText(ids) {
  const aktiv = ids.filter((id) => aktiveIds.has(id));
  if (!aktiv.length) return '—';
  if (rstIds.every((id) => aktiv.includes(id))) {
    const rest = aktiv.filter((id) => !rstIds.includes(id));
    return `alle ${rstIds.length} RST${rest.length ? ', ' + rest.map((id) => artikelNr.get(id)).join(', ') : ''}`;
  }
  return aktiv.map((id) => artikelNr.get(id) ?? id).join(', ');
}

const out = [];
out.push(`# Leadprint-Übersicht — Shop ${katalog.meta.shopId}`);
out.push('');
out.push(`> Erzeugt am ${new Date().toISOString().slice(0, 10)} aus \`src/data/leadprintShop.json\` (Stand ${katalog.meta.stand}), \`pricingConfig.default.json\` (${config.meta?.version ?? '?'}) und \`leadprintMapping.rst.json\`. Nicht von Hand bearbeiten — \`npx vite-node scripts/leadprintUebersicht.mjs\` neu ausführen.`);
out.push('');
out.push('## 1. Papiere (Sorten im Shop)');
out.push('');
const mitRechner = katalog.sorten.filter((s) => s.rechnerKey).length;
out.push(`${katalog.sorten.length} Sorten im Shop, davon ${mitRechner} im Rechner hinterlegt. Dicke und Preis kommen aus der pricingConfig (Verwaltung), nicht aus dem Katalog.`);
out.push('');
for (const [fam, famName] of Object.entries(katalog.meta.familien)) {
  const sorten = katalog.sorten.filter((s) => s.familie === fam).sort((a, b) => (a.gsm ?? 0) - (b.gsm ?? 0) || a.id - b.id);
  if (!sorten.length) continue;
  out.push(`### ${famName} (${fam})`);
  out.push('');
  out.push(tabelle(
    ['Sorten-ID', 'Name', 'g/m²', 'Rechner', 'Dicke µm', '€/1000', 'Verwendung im Rechner', 'aktiv in RST-Artikeln'],
    sorten.map((s) => {
      const p = s.rechnerKey ? papierById.get(s.rechnerKey) : null;
      return [
        s.id, s.name, s.gsm ?? '', s.rechnerKey ?? '—', p?.dickeUm ?? '', p ? eur(p.preisPro1000) : '',
        (verwendung.get(s.rechnerKey) ?? []).join(', '),
        aktivText(s.aktivInArtikeln),
      ];
    }),
  ));
  out.push('');
}
const ohneShop = config.papiere.filter((p) => !sorteByRechnerKey(katalog, p.id));
if (ohneShop.length) {
  out.push('### Rechner-Papiere ohne Shop-Sorte');
  out.push('');
  out.push(tabelle(['Rechner-ID', 'Name', 'Familie', 'Hinweis'], ohneShop.map((p) => [p.id, p.name, p.familie, [p.isBanner && 'Banner (nicht im Shop-Umfang)', p.isPlaceholder && 'Platzhalter'].filter(Boolean).join(', ')])));
  out.push('');
}

out.push('## 2. Optionsfelder');
out.push('');
for (const o of katalog.optionsfelder) {
  out.push(`### ${o.name} — Gruppe ${o.id} (${o.typ})`);
  out.push('');
  const strategie = mapping.optionsfelder?.[o.name]?.strategie;
  if (strategie) out.push(`RST-Strategie: ${strategie}`);
  if (!o.imExport) out.push('_In den vorliegenden Exporten nicht enthalten._');
  out.push('');
  out.push(tabelle(
    ['Listenwert-ID', 'Name', 'Sorte', 'Hinweis'],
    o.listenwerte.map((l) => [l.id ?? '(noch nicht angelegt)', l.name ?? '(Name fehlt)', l.sortenId ?? '', l.hinweis ?? '']),
  ));
  out.push('');
}
if (katalog.weitereOptionsgruppen?.length) {
  out.push(`### Weitere Optionsgruppen im Export (${katalog.weitereOptionsgruppen.length}, nicht benannt)`);
  out.push('');
  out.push('Diese Gruppen sind an den RST-Artikeln angelegt, aber deaktiviert. Namen beim Einbau anderer Produkte nachtragen.');
  out.push('');
  out.push(tabelle(['Gruppen-ID', 'Typ', 'Listenwerte'], katalog.weitereOptionsgruppen.map((g) => [g.id, g.typ, g.listenwerte.length ? g.listenwerte.join(', ') : '—'])));
  out.push('');
}

out.push('## 3. Artikel');
out.push('');
out.push(tabelle(
  ['Leadprint-ID', 'Artikelnummer', 'Bezeichnung', 'Produkt', 'Rechner-Schlüssel', 'Export vorhanden', 'Hinweis'],
  katalog.artikel.map((a) => [a.id, a.artikelnummer, a.bezeichnung, a.produkt ?? '—', a.mappingKey ?? '', a.imExport ? 'ja' : 'nein', a.hinweis ?? '']),
));
out.push('');
if (katalog.abgeloesteArtikel?.length) {
  out.push('### Abgelöste Artikel (nicht mehr bespielen)');
  out.push('');
  out.push(tabelle(['Leadprint-ID', 'Artikelnummer', 'Bezeichnung', 'Hinweis'], katalog.abgeloesteArtikel.map((a) => [a.id, a.artikelnummer ?? '—', a.bezeichnung, a.hinweis ?? ''])));
  out.push('');
}
out.push('## 4. Auflagenstaffeln (RST)');
out.push('');
out.push(mapping.auflagen.join(', '));
out.push('');

fs.writeFileSync(ziel, out.join('\n') + '\n');
console.log(`geschrieben: ${path.relative(process.cwd(), ziel)} (${katalog.sorten.length} Sorten, ${katalog.optionsfelder.length} Optionsfelder, ${katalog.artikel.length} Artikel)`);
