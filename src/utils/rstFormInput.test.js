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
});
