import { Home, Settings2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

// Reihenfolge der Tool-Links. Künftige Rechner (Flyer, Poster,
// Abschlussarbeiten) hier anhängen; ab ca. 5 Rechnern stattdessen ein
// Dropdown „Rechner“ vor den übrigen Tools.
const TOOLS = [
  { to: '/rechner-rst', label: 'RST Rechner' },
  { to: '/paypal-export', label: 'PayPal Export' },
  { to: '/post-versand', label: 'Rhaetia-Post-Manager' },
];

export function TopBar() {
  const { pathname } = useLocation();
  const isActive = (path) => pathname === path;

  return (
    <div className="sticky top-0 z-50 border-b border-line bg-surface">
      <div className="mx-auto flex h-[52px] max-w-[1560px] items-center gap-1 px-6">
        <Link
          to="/"
          title="Home"
          className={`mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            isActive('/') ? 'bg-brand-soft text-brand-fg' : 'text-dim hover:bg-surface2 hover:text-ink'
          }`}
        >
          <Home size={16} />
        </Link>

        <div className="mr-2 h-5 w-px bg-line" />

        <nav className="flex flex-1 items-center gap-0.5">
          {TOOLS.map((tool) => (
            <Link
              key={tool.to}
              to={tool.to}
              className={`rounded-[7px] px-[11px] py-[7px] text-[13px] font-medium transition-colors ${
                isActive(tool.to)
                  ? 'bg-brand-soft text-brand-fg'
                  : 'text-dim hover:bg-surface2 hover:text-ink'
              }`}
            >
              {tool.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <span
            title={`Build ${__APP_COMMIT__} vom ${new Date(__APP_BUILD_TIME__).toLocaleString('de-DE')}`}
            className="hidden select-none text-[11px] tabular-nums text-faint sm:block"
          >
            v{__APP_VERSION__} · {__APP_COMMIT__}
          </span>
          <ThemeToggle />
          <Link
            to="/verwaltung"
            className={`flex h-8 items-center gap-[7px] rounded-lg border border-line px-3 text-[13px] font-medium transition-colors ${
              isActive('/verwaltung')
                ? 'bg-brand-soft text-brand-fg'
                : 'text-dim hover:bg-surface2 hover:text-ink'
            }`}
          >
            <Settings2 size={15} />
            Verwaltung
          </Link>
        </div>
      </div>
    </div>
  );
}
