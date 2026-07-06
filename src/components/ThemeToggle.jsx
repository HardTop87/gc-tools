import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/theme-context';

const OPTIONS = [
  { value: 'light',  Icon: Sun,     label: 'Hell' },
  { value: 'system', Icon: Monitor, label: 'System' },
  { value: 'dark',   Icon: Moon,    label: 'Dunkel' },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex items-center gap-0.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-1"
      title="Farbschema wählen"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          title={opt.label}
          className={`rounded-lg p-1.5 transition-colors ${
            theme === opt.value
              ? 'bg-white dark:bg-gray-700 text-[#8e014d] shadow-sm'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <opt.Icon size={14} />
        </button>
      ))}
    </div>
  );
}
