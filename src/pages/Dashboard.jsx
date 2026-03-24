import { FileUp, ArrowRight, Calculator, Mail, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';

export default function Dashboard({ setIsAuthenticated }) {
  const navigate = useNavigate();

  const tools = [
    {
      title: "PayPal Export",
      description: "CSV für Steuerberater aufbereiten & gruppieren.",
      icon: <FileUp size={24} className="text-[#8e014d]" />,
      path: "/paypal-export"
    },
    {
      title: "RST Rechner",
      description: "Preisrechner für Rückstichheftungen (Broschüren).",
      icon: <Calculator size={24} className="text-[#8e014d]" />,
      path: "/rechner-rst"
    },
    {
      title: "Rhaetia-Post-Manager",
      description: "Versand-CSV für Rhaetia erstellen (inkl. Porto-Berechnung).",
      icon: <Mail size={24} className="text-[#8e014d]" />,
      path: "/post-versand"
    }
  ];

  const handleLogout = () => {
    localStorage.removeItem('gc_auth');
    if (setIsAuthenticated) setIsAuthenticated(false);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 overflow-hidden rounded-[28px] border border-[#8e014d]/20 bg-[#8e014d] text-white shadow-[0_30px_80px_-30px_rgba(142,1,77,0.5)]">
          <div className="px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
            <div className="flex items-center justify-between mb-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
                GC Digitaldruck München
              </div>
              <div className="flex items-center gap-4">
                <ThemeToggle />
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
                >
                  <LogOut size={16} />
                  Abmelden
                </button>
              </div>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">GC Tools</h1>
            <p className="mt-1 text-sm text-white/70">Interne Werkzeuge für GC Digitaldruck</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <Link
              key={tool.path}
              to={tool.path}
              className="group bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-[#8e014d]/30 dark:hover:border-[#8e014d]/50 transition-all duration-300 flex items-center space-x-5"
            >
              <div className="w-12 h-12 flex-shrink-0 rounded-xl flex items-center justify-center bg-[#fdf2f8] dark:bg-[#8e014d]/10 border border-[#8e014d]/10 dark:border-[#8e014d]/20 group-hover:scale-105 transition-transform">
                {tool.icon}
              </div>
              <div className="flex-grow">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-tight">{tool.title}</h3>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5 leading-relaxed">{tool.description}</p>
              </div>
              <div className="text-[#8e014d] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                <ArrowRight size={20} />
              </div>
            </Link>
          ))}
        </div>

        <footer className="mt-12 text-center text-[10px] text-gray-300 dark:text-gray-700 uppercase tracking-[0.3em]">
          &copy; {new Date().getFullYear()} GC Digitaldruck München
        </footer>
      </div>
    </div>
  );
}
