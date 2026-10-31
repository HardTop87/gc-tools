// Shop-Katalog (src/data/leadprintShop.json): Was es im Leadprint-Shop 666
// gibt — Sorten, Optionsfelder mit Listenwerten, Artikel — mit IDs und
// Klarnamen. Die Produkt-Mappings (leadprintMapping.<produkt>.json) verweisen
// auf diese IDs; Preise, Dicken und Grammaturen bleiben in der pricingConfig
// (Verwaltung), die Shop-IDs kommen aus dem Backend.
//
// Dieses Modul enthält nur Nachschlage- und Prüf-Funktionen — es schreibt
// nichts. Writer und Builder lesen weiterhin das RST-Mapping; der Katalog
// sichert per Test, dass beide dieselben IDs und Namen kennen.

export function sorteById(katalog, id) {
  return (katalog.sorten ?? []).find((s) => String(s.id) === String(id)) ?? null;
}

export function sorteByRechnerKey(katalog, rechnerKey) {
  return (katalog.sorten ?? []).find((s) => s.rechnerKey === rechnerKey) ?? null;
}

export function optionsfeldById(katalog, gruppenId) {
  return (katalog.optionsfelder ?? []).find((o) => String(o.id) === String(gruppenId)) ?? null;
}

export function listenwertById(katalog, gruppenId, listenwertId) {
  const feld = optionsfeldById(katalog, gruppenId);
  return feld?.listenwerte.find((l) => String(l.id) === String(listenwertId)) ?? null;
}

export function artikelById(katalog, id) {
  return (katalog.artikel ?? []).find((a) => String(a.id) === String(id)) ?? null;
}

// Innere Konsistenz des Katalogs: eindeutige IDs, Pflichtfelder, bekannte Familien.
export function pruefeKatalog(katalog) {
  const probleme = [];
  const doppelt = (liste, feld, was) => {
    const gesehen = new Set();
    for (const e of liste) {
      const wert = String(e[feld]);
      if (gesehen.has(wert)) probleme.push(`${was} ${wert}: doppelt.`);
      gesehen.add(wert);
    }
  };
  doppelt(katalog.sorten ?? [], 'id', 'Sorte');
  doppelt(katalog.optionsfelder ?? [], 'id', 'Optionsfeld');
  doppelt(katalog.artikel ?? [], 'id', 'Artikel');
  doppelt((katalog.artikel ?? []).filter((a) => a.artikelnummer), 'artikelnummer', 'Artikelnummer');

  const familien = new Set(Object.keys(katalog.meta?.familien ?? {}));
  const rechnerKeys = new Set();
  for (const s of katalog.sorten ?? []) {
    if (!s.name) probleme.push(`Sorte ${s.id}: Name fehlt.`);
    if (s.familie && familien.size && !familien.has(s.familie)) probleme.push(`Sorte ${s.id}: unbekannte Familie ${s.familie}.`);
    if (s.rechnerKey) {
      if (rechnerKeys.has(s.rechnerKey)) probleme.push(`rechnerKey ${s.rechnerKey}: mehreren Sorten zugeordnet.`);
      rechnerKeys.add(s.rechnerKey);
    }
  }
  for (const o of katalog.optionsfelder ?? []) {
    if (!o.name) probleme.push(`Optionsfeld ${o.id}: Name fehlt.`);
    doppelt((o.listenwerte ?? []).filter((l) => l.id != null), 'id', `Listenwert in ${o.name}`);
    for (const l of o.listenwerte ?? []) {
      if (l.sortenId && !sorteById(katalog, l.sortenId)) probleme.push(`Listenwert ${l.id} (${o.name}): sortenId ${l.sortenId} nicht im Katalog.`);
    }
  }
  for (const a of katalog.artikel ?? []) {
    if (!a.artikelnummer) probleme.push(`Artikel ${a.id}: Artikelnummer fehlt.`);
  }
  return probleme;
}

// Katalog ↔ pricingConfig: jeder rechnerKey muss ein Papier der Config sein;
// jedes Papier, das in einem Nicht-Banner-Format freigegeben ist, braucht eine
// Shop-Sorte (sonst könnte der Import-Writer es nie in den Shop schreiben).
export function pruefeKatalogGegenConfig(katalog, config) {
  const probleme = [];
  const paperIds = new Set(config.papiere.map((p) => p.id));
  for (const s of katalog.sorten ?? []) {
    if (s.rechnerKey && !paperIds.has(s.rechnerKey)) probleme.push(`Sorte ${s.id} (${s.name}): rechnerKey ${s.rechnerKey} gibt es nicht in der Config.`);
  }
  const gebraucht = new Set();
  for (const f of config.formate) {
    if (f.isBanner) continue;
    for (const id of [...f.papiereInhalt, ...f.papiereUmschlag]) gebraucht.add(id);
  }
  for (const id of gebraucht) {
    if (!sorteByRechnerKey(katalog, id)) probleme.push(`Config-Papier ${id}: keine Shop-Sorte im Katalog.`);
  }
  return probleme;
}

// Katalog ↔ Produkt-Mapping (RST): alle IDs und Namen, die das Mapping nutzt,
// müssen im Katalog stehen und dort gleich heißen — sonst driften die Quellen.
export function pruefeKatalogGegenMapping(katalog, mapping) {
  const probleme = [];
  for (const [key, s] of Object.entries(mapping.sorten ?? {})) {
    const k = sorteById(katalog, s.sortenId);
    if (!k) probleme.push(`Mapping-Sorte ${key}: sortenId ${s.sortenId} nicht im Katalog.`);
    else {
      if (k.rechnerKey !== key) probleme.push(`Sorte ${s.sortenId}: Katalog rechnerKey ${k.rechnerKey}, Mapping ${key}.`);
      if (k.name !== s.shopName) probleme.push(`Sorte ${s.sortenId}: Katalog „${k.name}“, Mapping „${s.shopName}“.`);
    }
  }
  const umschlagFeld = optionsfeldById(katalog, mapping.optionsfelder?.['Papier Umschlag (RST)']?.gruppenId);
  for (const [key, u] of Object.entries(mapping.umschlagListenwerte ?? {})) {
    const lw = umschlagFeld?.listenwerte.find((l) => String(l.id) === String(u.listenwertId));
    if (!lw) probleme.push(`Mapping-Umschlag ${key}: Listenwert ${u.listenwertId} nicht im Katalog (Gruppe ${umschlagFeld?.id ?? '?'}).`);
    else {
      if (lw.name !== u.shopName) probleme.push(`Umschlag-Listenwert ${u.listenwertId}: Katalog „${lw.name}“, Mapping „${u.shopName}“.`);
      const sorte = lw.sortenId ? sorteById(katalog, lw.sortenId) : null;
      if (sorte && sorte.rechnerKey !== key) probleme.push(`Umschlag-Listenwert ${u.listenwertId}: Sorte ${lw.sortenId} hat rechnerKey ${sorte.rechnerKey}, Mapping ${key}.`);
    }
  }
  for (const [name, feld] of Object.entries(mapping.optionsfelder ?? {})) {
    if (!feld.gruppenId) continue;
    const k = optionsfeldById(katalog, feld.gruppenId);
    if (!k) { probleme.push(`Mapping-Optionsfeld ${name}: Gruppe ${feld.gruppenId} nicht im Katalog.`); continue; }
    if (k.name !== name) probleme.push(`Gruppe ${feld.gruppenId}: Katalog „${k.name}“, Mapping „${name}“.`);
    if (name === 'Papier Umschlag (RST)') continue; // Listenwerte laufen über umschlagListenwerte
    for (const lw of feld.listenwerte ?? []) {
      if (lw.id == null) continue;
      const kl = k.listenwerte.find((l) => String(l.id) === String(lw.id));
      if (!kl) probleme.push(`${name}/${lw.id}: Listenwert nicht im Katalog.`);
      else if (kl.name !== lw.bezeichnung) probleme.push(`${name}/${lw.id}: Katalog „${kl.name}“, Mapping „${lw.bezeichnung}“.`);
    }
  }
  for (const a of mapping.artikel ?? []) {
    const k = artikelById(katalog, a.leadprintId);
    if (!k) probleme.push(`Mapping-Artikel ${a.key}: ID ${a.leadprintId} nicht im Katalog.`);
    else if (k.artikelnummer !== a.artikelnummer) probleme.push(`Artikel ${a.leadprintId}: Katalog ${k.artikelnummer}, Mapping ${a.artikelnummer}.`);
  }
  return probleme;
}

