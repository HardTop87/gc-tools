import { Link, useNavigate } from 'react-router-dom';

const TOOLS = [
  {
    title: 'RST Rechner',
    description: 'Preisrechner für Rückstichheftungen — GC (Horizon), Kopp, ILDA.',
    path: '/rechner-rst',
  },
  {
    title: 'Verwaltung',
    description: 'Papierpreise, Grundpreise und Verarbeitungstabellen pflegen.',
    path: '/verwaltung',
  },
  {
    title: 'PayPal Export',
    description: 'CSV für Steuerberater aufbereiten & gruppieren.',
    path: '/paypal-export',
  },
  {
    title: 'Rhaetia-Post-Manager',
    description: 'Versand-CSV für Rhaetia erstellen (inkl. Porto-Berechnung).',
    path: '/post-versand',
  },
];

export default function Dashboard({ setIsAuthenticated }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('gc_auth');
    if (setIsAuthenticated) setIsAuthenticated(false);
    navigate('/login');
  };

  return (
    <div className="mx-auto max-w-[960px] px-6 pt-16">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-faint">
        GC Digitaldruck München
      </div>
      <h1 className="mt-3.5 text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
        Interne Werkzeuge
      </h1>
      <p className="mt-2 max-w-[52ch] text-[15px] text-dim">Kalkulation, Exporte und Preispflege.</p>

      <div className="mt-9 grid grid-cols-1 gap-3 md:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.path}
            to={tool.path}
            className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-[22px] shadow-card transition-colors hover:border-brand-fg"
          >
            <span className="text-base font-semibold text-brand-fg">{tool.title}</span>
            <span className="text-[13.5px] leading-[1.5] text-dim">{tool.description}</span>
          </Link>
        ))}
      </div>

      <div className="mt-7 pb-16 text-xs text-faint">
        Angemeldet ·{' '}
        <button type="button" onClick={handleLogout} className="text-brand-fg hover:underline">
          Abmelden
        </button>
      </div>
    </div>
  );
}
