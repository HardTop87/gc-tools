// B4: Pflichtfeld-Prüfung des RST-Rechners WÄHREND des Tippens.
// Die Engine (calculateRSTPrice) fällt bei leeren/ungültigen Eingaben still auf
// plausible Defaults zurück (Auflage 1, 8 Seiten) — für programmatische Aufrufer
// wie den Leadprint-Mapper gewollt und unverändert. Im Rechner mit Live-Berechnung
// wäre das gefährlich: Wer ein Feld leert, sähe dazwischen einen vollständigen,
// plausiblen und falschen Preis. Deshalb prüft die UI vor der Berechnung.

// Liest eine positive Ganzzahl (≥ 1); alles andere — leer, "abc", "12,5",
// "12.5", "0", negative Werte — liefert null.
export function parsePositiveInt(value) {
  const s = String(value ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return n >= 1 ? n : null;
}

// Liefert die Hinweise zu fehlenden/ungültigen Pflichtfeldern des Rechners.
// Leere Liste = Eingaben vollständig, es darf gerechnet werden. Die fachlichen
// Regeln zur Seitenzahl (Vielfaches von 4, Minimum) prüft weiterhin die Engine
// mit eigenen, klaren Meldungen (B5).
export function pruefeRSTPflichtfelder({ auflage, seiten }) {
  const probleme = [];
  if (parsePositiveInt(auflage) === null) {
    probleme.push('Bitte Auflage eingeben (ganze Zahl ab 1).');
  }
  if (parsePositiveInt(seiten) === null) {
    probleme.push('Bitte Seitenzahl eingeben.');
  }
  return probleme;
}
