import { minSeiten } from './calculateRSTPrice';

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
// Leere Liste = Eingaben vollständig, es darf gerechnet werden.
// Auch die fachlichen Seitenzahl-Regeln (Vielfaches von 4, Minimum 8 ohne /
// 4 mit Umschlag) werden hier geprüft — mit dem nächstmöglichen Wert im Text,
// statt die Eingabe still zu korrigieren. Die Engine prüft dieselben Regeln
// zusätzlich für programmatische Aufrufer (B5).
export function pruefeRSTPflichtfelder({ auflage, seiten, hasUmschlag = false }) {
  const probleme = [];
  if (parsePositiveInt(auflage) === null) {
    probleme.push('Bitte Auflage eingeben (ganze Zahl ab 1).');
  }
  const s = parsePositiveInt(seiten);
  if (s === null) {
    probleme.push('Bitte Seitenzahl eingeben.');
  } else {
    const min = minSeiten(hasUmschlag);
    const naechste = Math.max(min, Math.ceil(s / 4) * 4);
    if (s % 4 !== 0) {
      probleme.push(`${s} Seiten sind kein Vielfaches von 4 — nächstmöglich: ${naechste}.`);
    } else if (s < min) {
      probleme.push(
        hasUmschlag
          ? `Mit Umschlag sind mindestens 4 Seiten Inhalt nötig — nächstmöglich: ${naechste}.`
          : `Ohne Umschlag sind mindestens 8 Seiten nötig (4 Seiten gibt es nur mit Umschlag).`,
      );
    }
  }
  return probleme;
}
