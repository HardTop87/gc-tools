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
      className="flex items-center gap-0.5 rounded-[9px] border border-line bg-surface2 p-[3px]"
      title="Farbschema wählen"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          title={opt.label}
          className={`flex h-6 w-[26px] items-center justify-center rounded-md transition-colors ${
            theme === opt.value
              ? 'bg-surface text-brand-fg'
              : 'text-faint hover:text-ink'
          }`}
        >
          <opt.Icon size={14} />
        </button>
      ))}
    </div>
  );
}
