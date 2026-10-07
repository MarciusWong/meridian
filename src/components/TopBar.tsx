import { useTheme, type ThemeChoice } from '../lib/theme';
import { Icon } from './Icon';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const ICON = { system: 'monitor', light: 'sun', dark: 'moon' } as const;

export function TopBar({ navigate }: { navigate: (path: string) => void }) {
  const [theme, setTheme] = useTheme();
  return (
    <header className="topbar no-print">
      <div className="container topbar-inner">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16 5v22M5.5 12.5h21M5.5 19.5h21" stroke="currentColor" strokeWidth="1.4" opacity=".45" />
            <circle cx="22" cy="11" r="3.4" fill="var(--accent)" />
          </svg>
          <span>Meridian</span>
          <span className="brand-tag">global page speed</span>
        </a>
        <nav className="topbar-nav">
          <a
            href="/"
            className="btn btn-sm btn-ghost"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            New test
          </a>
          <button
            type="button"
            className="btn btn-sm btn-ghost theme-toggle"
            onClick={() => setTheme(NEXT[theme])}
            aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}.`}
            title={`Theme: ${theme}`}
          >
            <Icon name={ICON[theme]} />
          </button>
        </nav>
      </div>
    </header>
  );
}
