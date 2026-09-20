import React from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Sicherheitsnetz gegen den „weißen Bildschirm": Ein Render-Fehler in einer
// Seite zerstörte bisher die ganze App samt aller ungespeicherten Eingaben,
// ohne jede Meldung (Post-Manager-Absturz 21.09.2026). Jetzt bleibt die
// TopBar bedienbar und der Fehler steht lesbar auf dem Schirm.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Für die Fehlersuche in der Browser-Konsole, inkl. Komponentenpfad.
    console.error('Render-Fehler in Seite', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border-2 border-red-300 bg-red-50 p-10 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle size={28} className="shrink-0" />
            <h1 className="text-2xl font-black uppercase tracking-tight">Diese Seite ist abgestürzt</h1>
          </div>
          <p className="mb-6 text-sm font-semibold">
            Die übrigen Seiten funktionieren weiter. Hochgeladene Dateien und Eingaben dieser Seite
            sind verloren, wenn sie neu geladen wird. Bitte den Fehlertext an Armin weitergeben.
          </p>
          <pre className="mb-6 overflow-auto rounded-xl bg-white/70 p-4 text-[11px] leading-relaxed dark:bg-black/30">
            {String(error?.message || error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-800"
          >
            <RotateCcw size={14} /> Seite neu laden
          </button>
        </div>
      </div>
    );
  }
}

// Pro Route ein frischer Boundary-Zustand: Wechselt man nach einem Absturz
// auf eine andere Seite, wird die neue Seite normal gerendert.
export function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

export default ErrorBoundary;
