import { describe, expect, it } from 'vitest';
import mapping from '../data/leadprintMapping.rst.json';
import { getDefaultPricingConfig } from './pricingConfig';
import { calculateRSTPrice } from './calculateRSTPrice';
import {
  ROUTE_TAGS,
  SEITEN_STUETZSTELLEN_MIT_UMSCHLAG,
  buildPreiszeilenOhneUmschlag,
  pruefeMappingVollstaendigkeit,
} from './leadprintWriter';

const config = getDefaultPricingConfig();

describe('Leadprint-Writer: Datenschicht (ohne-Umschlag-Artikel)', () => {
  it('4 ist die erste Stützstelle der mit-Umschlag-Artikel (P3)', () => {
    expect(SEITEN_STUETZSTELLEN_MIT_UMSCHLAG[0]).toBe(4);
    expect(SEITEN_STUETZSTELLEN_MIT_UMSCHLAG[1]).toBe(8);
  });

  it('baut die Preiszeilen mit Shop-IDs und exakten Engine-Preisen', () => {
    const { zeilen, probleme } = buildPreiszeilenOhneUmschlag({
      config,
      mapping,
      artikelKey: 'A4_Hoch|4c|ohne',
    });
    expect(probleme).toEqual([]);
    expect(zeilen.length).toBeGreaterThan(0);

    // Stichprobe: CC_120 × 100 Ex. — Basispreis und ein Aufschlag exakt wie die Engine
    const zeile = zeilen.find((z) => z.papierId === 'CC_120' && z.auflage === 100);
    expect(zeile.sortenId).toBe(mapping.sorten.CC_120.sortenId);
    const direkt = (seiten) => {
      const calc = calculateRSTPrice(
        {
          formatKey: 'A4_Hoch', auflage: 100, seiten, pInhaltId: 'CC_120', dInhaltKey: '4c',
          hasUmschlag: false, pUmschlagId: '', dUmschlagKey: '4c', celloUmschlag: 'ohne',
          produktionszeit: 'standard',
        },
        config,
      );
      return calc.validResults.find((r) => r.name === calc.recommendedName).gesamt;
    };
    expect(zeile.preis).toBeCloseTo(direkt(8), 8);
    const lw24 = mapping.optionsfelder['Seitenanzahl Innenteil'].werte['24'];
    expect(zeile.aufschlaege[lw24]).toBeCloseTo(direkt(24) - direkt(8), 8);
  });

  it('stempelt jede Zeile mit Routen-Tag in der Artikelnummer und Liefertagen (Option 2 + Bonus)', () => {
    const { zeilen, probleme } = buildPreiszeilenOhneUmschlag({
      config,
      mapping,
      artikelKey: 'A4_Hoch|4c|ohne',
    });
    expect(probleme).toEqual([]);
    // GC-Zelle: CC_120 × 100 Ex. (Referenzfall — Empfehlung GC)
    const gcZeile = zeilen.find((z) => z.papierId === 'CC_120' && z.auflage === 100);
    expect(gcZeile.route).toBe('GC (Horizon)');
    expect(gcZeile.artikelnummer).toBe('BRO-RST-A4H-44-GC');
    // Zeilenmaximum: Sobald eine Seiten-Zelle der Zeile bei ILDA (4 WT) liegt,
    // trägt die ganze Zeile 4 Liefertage — nie weniger als die Basiszelle.
    for (const z of zeilen) {
      expect(z.liefertage).toBeGreaterThanOrEqual(z.produktionszeitWT);
      const hatIlda = Object.values(z.routenSeiten).includes('Partner ILDA');
      expect(z.liefertage).toBe(hatIlda ? 4 : 3);
    }
    expect(zeilen.some((z) => z.liefertage === 4)).toBe(true);
    // Partner-Zelle: über GC-Maximum (500) muss ein Partner-Tag stehen
    const partnerZeile = zeilen.find((z) => z.papierId === 'CC_120' && z.auflage === 1000);
    expect(['KOPP', 'ILDA']).toContain(partnerZeile.artikelnummer.split('-').pop());
    expect(partnerZeile.artikelnummer.startsWith('BRO-RST-A4H-44-')).toBe(true);
    // jede Zeile hat einen bekannten Tag
    for (const z of zeilen) {
      expect(z.artikelnummer).toBe(`BRO-RST-A4H-44-${ROUTE_TAGS[z.route]}`);
      expect(z.liefertage).toBeGreaterThan(0);
    }
  });

  it('unmögliche Kombinationen bleiben null — nie 0 (Entscheidung D1)', () => {
    const { zeilen } = buildPreiszeilenOhneUmschlag({
      config,
      mapping,
      artikelKey: 'A4_Hoch|4c|ohne',
    });
    // CC_160 (166 µm): Partner-Limit 60 Seiten → 64+ muss leer bleiben
    const zeile = zeilen.find((z) => z.papierId === 'CC_160' && z.auflage === 100);
    const lw60 = mapping.optionsfelder['Seitenanzahl Innenteil'].werte['60'];
    const lw64 = mapping.optionsfelder['Seitenanzahl Innenteil'].werte['64'];
    expect(zeile.aufschlaege[lw60]).not.toBeNull();
    expect(zeile.aufschlaege[lw64]).toBeNull();
  });

  it('Vollständigkeits-Prüfung Config ↔ Mapping meldet Lücken statt still zu schweigen', () => {
    // Seit 10.10.2026 vollständig (Listenwert „4 Seiten" = 52313 bestätigt).
    // Dieser Test friert den Stand ein, damit neue Lücken (z. B. neue Papiere
    // ohne Shop-ID) sofort auffallen.
    expect(pruefeMappingVollstaendigkeit(config, mapping)).toEqual([]);
  });

  it('Vollständigkeits-Prüfung meldet Artikel ohne leadprintId (Ziel der Weiterleitungen, M9)', () => {
    const ohneId = structuredClone(mapping);
    ohneId.artikel.find((a) => a.key === 'A6_Hoch|4c|ohne').leadprintId = null;
    expect(pruefeMappingVollstaendigkeit(config, ohneId)).toEqual(['Artikel A6_Hoch|4c|ohne: keine leadprintId im Mapping.']);
  });
});
