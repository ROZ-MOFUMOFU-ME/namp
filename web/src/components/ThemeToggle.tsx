import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme.ts';

// Header button that flips light <-> dark and persists the choice.
export default function ThemeToggle() {
    const { t } = useTranslation();
    const [theme, setTheme] = useTheme();
    const dark = theme === 'dark';
    const label = t('theme_toggle', 'Toggle light/dark theme');
    // Icon-only at nav grey read as decoration beside the labelled links; a
    // bordered control at full contrast reads as a button.
    return (
        <button
            type="button"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            title={label}
            aria-label={label}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-white hover:bg-navhover hover:text-white"
        >
            <i className={`fas fa-fw ${dark ? 'fa-sun' : 'fa-moon'}`} />
            <span className="hidden text-sm xl:inline">
                {dark ? t('theme_light', 'Light') : t('theme_dark', 'Dark')}
            </span>
        </button>
    );
}
