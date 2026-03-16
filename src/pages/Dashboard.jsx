import { FileUp, ArrowRight, Calculator, Mail, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

// Wir nehmen setIsAuthenticated als "Prop" entgegen
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
    // 1. Lokalen Speicher leeren
    localStorage.removeItem('gc_auth');
    
    // 2. Den App-Status sofort auf false setzen (WICHTIG!)
    if (setIsAuthenticated) {
      setIsAuthenticated(false);
    }
    
    // 3. Zum Login weiterleiten
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50/50 flex items-center justify-center relative">
      <button 
        onClick={handleLogout}
        className="absolute top-6 right-6 flex items-center space-x-2 text-gray-400 hover:text-[#8e014d] transition-colors text-xs uppercase tracking-widest font-bold"
      >
        <LogOut size={16} />
        <span>Abmelden</span>
      </button>

      <div className="max-w-4xl w-full py-12 px-6">
        <header className="mb-10 text-center sm:text-left border-b border-gray-200 pb-6">
          <h1 className="text-3xl font-black text-[#8e014d] tracking-tight">GC Tools</h1>
          <p className="text-gray-500 text-sm mt-1">Interne Werkzeuge für GC Digitaldruck</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <Link 
              key={tool.path} 
              to={tool.path}
              className="group bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-[#8e014d]/30 transition-all duration-300 flex items-center space-x-5"
            >
              <div className="w-12 h-12 flex-shrink-0 rounded-xl flex items-center justify-center bg-[#fdf2f8] border border-[#8e014d]/10 group-hover:scale-105 transition-transform">
                {tool.icon}
              </div>
              
              <div className="flex-grow">
                <h3 className="text-lg font-bold text-gray-800 leading-tight">{tool.title}</h3>
                <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
                  {tool.description}
                </p>
              </div>

              <div className="text-[#8e014d] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                <ArrowRight size={20} />
              </div>
            </Link>
          ))}
        </div>

        <footer className="mt-12 text-center text-[10px] text-gray-300 uppercase tracking-[0.3em]">
          &copy; {new Date().getFullYear()} GC Digitaldruck München
        </footer>
      </div>
    </div>
  );
}