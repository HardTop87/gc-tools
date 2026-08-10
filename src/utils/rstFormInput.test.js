import { describe, expect, it } from 'vitest';
import { parsePositiveInt, pruefeRSTPflichtfelder } from './rstFormInput';

describe('B4: Pflichtfeld-Prüfung des Rechners', () => {
  it('parsePositiveInt akzeptiert nur ganze Zahlen ab 1', () => {
    expect(parsePositiveInt('100')).toBe(100);
    expect(parsePositiveInt(' 8 ')).toBe(8);
    expect(parsePositiveInt(24)).toBe(24);
    // die Fälle aus dem Befund: Engine hätte still 1 bzw. 8 gerechnet
    expect(parsePositiveInt('')).toBeNull();
    expect(parsePositiveInt('abc')).toBeNull();
    expect(parsePositiveInt('0')).toBeNull();
    expect(parsePositiveInt('12,5')).toBeNull();
    expect(parsePositiveInt('12.5')).toBeNull();
    expect(parsePositiveInt('-3')).toBeNull();
    expect(parsePositiveInt(null)).toBeNull();
    expect(parsePositiveInt(undefined)).toBeNull();
  });

  it('meldet fehlende Auflage und Seitenzahl einzeln und gemeinsam', () => {
    expect(pruefeRSTPflichtfelder({ auflage: '100', seiten: '24' })).toEqual([]);
    expect(pruefeRSTPflichtfelder({ auflage: '', seiten: '24' })).toEqual([
      'Bitte Auflage eingeben (ganze Zahl ab 1).',
    ]);
    expect(pruefeRSTPflichtfelder({ auflage: '100', seiten: '' })).toEqual([
      'Bitte Seitenzahl eingeben.',
    ]);
    expect(pruefeRSTPflichtfelder({ auflage: '', seiten: '' })).toHaveLength(2);
  });

  it('Zwischenzustände beim Tippen (Dezimalwerte, Text) blockieren die Berechnung', () => {
    expect(pruefeRSTPflichtfelder({ auflage: '12,5', seiten: '24' })).toHaveLength(1);
    expect(pruefeRSTPflichtfelder({ auflage: 'abc', seiten: '24' })).toHaveLength(1);
  });

  it('erklärt ungültige Seitenzahlen mit dem nächstmöglichen Wert statt still zu korrigieren', () => {
    expect(pruefeRSTPflichtfelder({ auflage: '100', seiten: '33' })).toEqual([
      '33 Seiten sind kein Vielfaches von 4 — nächstmöglich: 36.',
    ]);
    // unter dem Minimum: 4 geht nur mit Umschlag
    expect(pruefeRSTPflichtfelder({ auflage: '100', seiten: '4' })).toEqual([
      'Ohne Umschlag sind mindestens 8 Seiten nötig (4 Seiten gibt es nur mit Umschlag).',
    ]);
    expect(pruefeRSTPflichtfelder({ auflage: '100', seiten: '4', hasUmschlag: true })).toEqual([]);
    // kein Vielfaches UND unter dem Minimum: die 4er-Regel zuerst, Vorschlag beachtet das Minimum
    expect(pruefeRSTPflichtfelder({ auflage: '100', seiten: '3' })).toEqual([
      '3 Seiten sind kein Vielfaches von 4 — nächstmöglich: 8.',
    ]);
    expect(pruefeRSTPflichtfelder({ auflage: '100', seiten: '3', hasUmschlag: true })).toEqual([
      '3 Seiten sind kein Vielfaches von 4 — nächstmöglich: 4.',
    ]);
  });
});
