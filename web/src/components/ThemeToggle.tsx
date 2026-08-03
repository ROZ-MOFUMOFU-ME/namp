import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme.ts';

/*
 * Header control that flips light <-> dark and persists the choice.
 *
 * A sliding switch rather than a plain icon: the knob's position shows the
 * current theme at a glance, which a lone sun-or-moon glyph never did — and
 * it needs no text label to be recognisable as a control.
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
            role="switch"
            aria-checked={dark}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            title={label}
            aria-label={label}
            className="relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border border-white/15 bg-black/25 transition-colors hover:border-white/30"
        >
            {/* Both icons stay visible; the knob slides over the inactive one. */}
            <i className="fas fa-sun pointer-events-none absolute left-[7px] text-[11px] text-amber-300/90" />
            <i className="fas fa-moon pointer-events-none absolute right-[7px] text-[11px] text-sky-300/90" />
            <span
                className={`pointer-events-none absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200 ${
                    dark ? 'translate-x-[30px]' : 'translate-x-[3px]'
                }`}
            />
        </button>
    );
}
