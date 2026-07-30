import { describe, it, expect, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import RechnerRST from './pages/Rechner-RST';
import Verwaltung from './pages/Verwaltung';
import PayPalExport from './pages/PayPalExport';
import PostVersand from './pages/PostVersand';
import { TopBar } from './components/TopBar';
import { ThemeProvider } from './context/ThemeContext';

beforeAll(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.document = {
    documentElement: { classList: { add() {}, remove() {} } },
    addEventListener() {},
    removeEventListener() {},
    visibilityState: 'visible',
  };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
});

function render(ui, route = '/') {
  return renderToString(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Redesign rendert', () => {
  it('TopBar', () => {
    const html = render(<TopBar />, '/rechner-rst');
    expect(html).toContain('RST Rechner');
    expect(html).toContain('Verwaltung');
  });

  it('Home', () => {
    const html = render(<Dashboard setIsAuthenticated={() => {}} />);
    expect(html).toContain('Interne Werkzeuge');
    expect(html).toContain('Rhaetia-Post-Manager');
  });

  it('RST-Rechner mit Vergleichstabelle', () => {
    const html = render(<RechnerRST />, '/rechner-rst');
    expect(html).toContain('Kalkulator Rückstichheftung');
    expect(html).toContain('Vergleich');
    expect(html).toContain('GC (Horizon)');
    expect(html).toContain('Bögen gesamt');
    expect(html).toContain('teurer als Empfehlung');
  });

  it('Verwaltung mit Bereichen und Tabs', () => {
    const html = render(<Verwaltung />, '/verwaltung');
    expect(html).toContain('Verwaltung — Kalkulationsbasis');
    expect(html).toContain('Gemeinsame Basis');
    expect(html).toContain('Rückstichheftung');
    expect(html).toContain('Papierpreise');
    expect(html).toContain('80g Natur');
  });

  it('PayPal Export', () => {
    const html = render(<PayPalExport />, '/paypal-export');
    expect(html).toContain('PayPal Reconciliation');
    expect(html).toContain('Dropzone 1');
    expect(html).toContain('Noch keine Datei');
  });

  it('Rhaetia Post-Manager', () => {
    const html = render(<PostVersand />, '/post-versand');
    expect(html).toContain('Rhaetia Post-Manager');
    expect(html).toContain('Pre-Match');
  });
});
