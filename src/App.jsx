import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import RechnerRST from './pages/Rechner-RST';
import PayPalExport from './pages/PayPalExport';
import PostVersand from './pages/PostVersand';
import { ThemeProvider } from './context/ThemeContext';
import { Lock, Info } from 'lucide-react';

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [showImpressum, setShowImpressum] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Falls die .env Variable fehlt, wird ein Fallback-Check verhindert
    const correctPassword = import.meta.env.VITE_APP_PASSWORD;
    
    if (correctPassword && password === correctPassword) {
      onLogin();
    } else {
      setError(true);    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 p-10 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 mb-6">
          <div className="w-16 h-16 bg-[#fdf2f8] rounded-2xl flex items-center justify-center mb-8 mx-auto border border-[#8e014d]/10 text-[#8e014d]">
            <Lock size={32} />
          </div>
          
          <h1 className="text-3xl font-black text-center text-[#8e014d] mb-2 tracking-tight">GC Tools</h1>
          <p className="text-gray-400 dark:text-gray-500 text-center text-sm mb-8">Bitte Passwort für den Zugriff eingeben</p>

          <input
            type="password"
            autoFocus
            placeholder="Passwort"
            className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl mb-2 focus:ring-2 focus:ring-[#8e014d] outline-none transition-all text-center font-bold text-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          
          {error && <p className="text-red-500 text-[10px] uppercase font-bold tracking-widest text-center mb-4">Zugriff verweigert</p>}
          
          <button className="w-full py-4 bg-[#8e014d] text-white rounded-2xl font-bold hover:bg-[#70013d] transition-all shadow-lg">
            Anmelden
          </button>
        </form>

        <div className="text-center">
          <button 
            onClick={() => setShowImpressum(!showImpressum)}
            className="text-gray-400 text-[10px] uppercase tracking-[0.2em] hover:text-[#8e014d] transition-colors flex items-center justify-center mx-auto"
          >
            <Info size={12} className="mr-1" /> {showImpressum ? 'Schließen' : 'Impressum & Rechtliches'}
          </button>
        </div>

        {showImpressum && (
          <div className="mt-8 p-8 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed animate-in fade-in duration-300">
            <h2 className="font-bold text-gray-800 dark:text-gray-200 mb-4 uppercase tracking-wider text-xs">Impressum</h2>
            <p className="mb-4">
              <strong>Betreiber:</strong><br />
              Guido Coenen, GC Digitaldruck<br />
              Landsberger Straße 318a, 80687 München<br />
              Tel.: 089/1800 6270 | Fax: 089/1800 6271<br />
              E-Mail: gc@gc-digitaldruck.de
            </p>
            <p className="mb-4">
              <strong>Umsatzsteuer-ID:</strong> DE265655564<br />
              <strong>Verantwortlich i.S.d. § 55 Abs. 2 RStV:</strong> Guido Coenen
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const persistedAuth = localStorage.getItem('gc_auth') === 'true';
    setIsAuthenticated(persistedAuth);
  }, []);

  const handleLogin = () => {
    localStorage.setItem('gc_auth', 'true');
    setIsAuthenticated(true);
  };

  return (
    <ThemeProvider>
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={!isAuthenticated ? <Login onLogin={handleLogin} /> : <Navigate to="/" replace />}
          />
          
          {/* Dashboard */}
          <Route 
            path="/" 
            element={isAuthenticated ? <Dashboard setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/login" replace />} 
          />          
          {/* Rückstichheftung */}
          <Route path="/rechner-rst" element={isAuthenticated ? <RechnerRST /> : <Navigate to="/login" replace />} />
          
          {/* PayPal Export */}
          <Route path="/paypal-export" element={isAuthenticated ? <PayPalExport /> : <Navigate to="/login" replace />} />

          {/* Post Versand */}
          <Route path="/post-versand" element={isAuthenticated ? <PostVersand setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/login" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
        </Routes>
      </BrowserRouter>
    </div>
    </ThemeProvider>
  );
}