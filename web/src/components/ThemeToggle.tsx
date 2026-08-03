import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme.ts';

/*
 * Header control that flips light <-> dark and persists the choice.
 *
 * Shows the theme it will switch TO — a moon while light, a sun while dark —
 * which is the convention every miner has seen elsewhere. The icon carries
 * its own colour and a bordered button around it, because at nav grey and
 * without a frame it read as decoration rather than a control.
 */
export default function ThemeToggle() {
    const { t } = useTranslation();
    const [theme, setTheme] = useTheme();
    const dark = theme === 'dark';
    const label = dark
        ? t('theme_to_light', 'Switch to light theme')
        : t('theme_to_dark', 'Switch to dark theme');

    return (
        <button
            type="button"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            title={label}
            aria-label={label}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/15 bg-black/20 transition-colors hover:border-white/30 hover:bg-navhover"
        >
            <i
                className={
                    dark
                        ? 'fas fa-sun text-base text-amber-300'
                        : 'fas fa-moon text-base text-sky-300'
                }
            />
        </button>
    );
}
