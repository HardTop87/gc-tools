import { describe, expect, it } from 'vitest';
import katalog from '../data/leadprintShop.json';
import mapping from '../data/leadprintMapping.rst.json';
import { getDefaultPricingConfig } from './pricingConfig';
import {
  artikelById,
  listenwertById,
  pruefeKatalog,
  pruefeKatalogGegenConfig,
  pruefeKatalogGegenMapping,
  sorteById,
  sorteByRechnerKey,
} from './leadprintShop';

const config = getDefaultPricingConfig();

describe('leadprintShop.json — Shop-Katalog', () => {
  it('ist in sich konsistent (IDs eindeutig, Namen vorhanden, Familien bekannt)', () => {
    expect(pruefeKatalog(katalog)).toEqual([]);
  });

  it('passt zur pricingConfig: rechnerKeys existieren, alle Shop-Papiere der Formate haben eine Sorte', () => {
    expect(pruefeKatalogGegenConfig(katalog, config)).toEqual([]);
  });

  it('passt zum RST-Mapping: gleiche IDs, gleiche Namen, gleiche Artikelnummern', () => {
    expect(pruefeKatalogGegenMapping(katalog, mapping)).toEqual([]);
  });

  it('kennt die RST-Stichproben', () => {
    expect(sorteById(katalog, 1943)).toMatchObject({ name: '120g ColorCopy', rechnerKey: 'CC_120', familie: 'CC' });
    expect(sorteByRechnerKey(katalog, 'R_90')).toMatchObject({ id: 6389 });
    expect(listenwertById(katalog, 5628, 16360)).toMatchObject({ name: '8 Seiten' });
    expect(listenwertById(katalog, 5555, 16084)).toMatchObject({ name: '250g ColorCopy', sortenId: 1947 });
    expect(artikelById(katalog, 1112051356)).toMatchObject({ artikelnummer: 'BRO-RST-A4H-44', produkt: 'rst' });
  });

  it('meldet Drift zwischen Katalog und Mapping', () => {
    const kaputt = structuredClone(katalog);
    sorteById(kaputt, 1943).name = '120g ColourCopy';
    artikelById(kaputt, 1112051356).artikelnummer = 'FALSCH';
    const probleme = pruefeKatalogGegenMapping(kaputt, mapping);
    expect(probleme).toContain('Sorte 1943: Katalog „120g ColourCopy“, Mapping „120g ColorCopy“.');
    expect(probleme.some((p) => p.startsWith('Artikel 1112051356'))).toBe(true);
  });

  it('meldet Config-Papiere ohne Shop-Sorte und unbekannte rechnerKeys', () => {
    const kaputt = structuredClone(katalog);
    sorteByRechnerKey(kaputt, 'N_80').rechnerKey = 'N_81';
    const probleme = pruefeKatalogGegenConfig(kaputt, config);
    expect(probleme).toContain('Sorte 1933 (80g Natur): rechnerKey N_81 gibt es nicht in der Config.');
    expect(probleme).toContain('Config-Papier N_80: keine Shop-Sorte im Katalog.');
  });

  it('meldet doppelte IDs im Katalog', () => {
    const kaputt = structuredClone(katalog);
    kaputt.sorten.push({ ...kaputt.sorten[0] });
    expect(pruefeKatalog(kaputt)).toContain(`Sorte ${kaputt.sorten[0].id}: doppelt.`);
  });
});
