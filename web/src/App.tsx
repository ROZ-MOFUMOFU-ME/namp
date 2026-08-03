import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header.tsx';
import Footer from './components/Footer.tsx';
import Home from './pages/Home.tsx';
import Stats from './pages/Stats.tsx';
import Workers from './pages/Workers.tsx';
import MinerStats from './pages/MinerStats.tsx';
import Payments from './pages/Payments.tsx';
import TabStats from './pages/TabStats.tsx';
import GettingStarted from './pages/GettingStarted.tsx';
import ApiDocs from './pages/ApiDocs.tsx';
import Admin from './pages/Admin.tsx';
import { getConfig } from './api/client.ts';
import { tabStatsEnabled } from './lib/features.ts';
import type { AppConfigAnalyticsScript } from './api/types.ts';

export default function App() {
    // Site chrome is config-driven (GET /api/config). The static index.html
    // title/favicon are just the pre-hydration fallbacks.
    const config = useQuery({ queryKey: ['config'], queryFn: getConfig });
    const branding = config.data?.branding;

    const siteName = branding?.siteName;
    useEffect(() => {
        if (siteName) document.title = siteName;
    }, [siteName]);

    const favicon = branding?.favicon;
    useEffect(() => {
        if (!favicon) return;
        let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = favicon;
    }, [favicon]);

    // Google Analytics 4. The loader is a normal <script src>, but the init
    // runs here in the bundle rather than as an injected inline <script>:
    // a CSP that carries a hash (ours does, for the shell's no-flash script)
    // ignores 'unsafe-inline' entirely, so an inline snippet can never be
    // allowed alongside it. Calling gtag directly needs no exception at all.
    const gaId = branding?.analytics?.googleAnalyticsId;
    useEffect(() => {
        if (!gaId) return;
        const loader = document.createElement('script');
        loader.async = true;
        loader.src =
            'https://www.googletagmanager.com/gtag/js?id=' +
            encodeURIComponent(gaId);
        document.head.append(loader);

        const w = window as unknown as {
            dataLayer?: unknown[];
            gtag?: (...args: unknown[]) => void;
        };
        w.dataLayer = w.dataLayer || [];
        // gtag pushes `arguments` verbatim; an arrow function has none, so
        // this stays a function expression on purpose.
        w.gtag =
            w.gtag ||
            function (...args: unknown[]) {
                w.dataLayer!.push(args);
            };
        w.gtag('js', new Date());
        w.gtag('config', gaId);

        return () => {
            loader.remove();
        };
    }, [gaId]);

    // Arbitrary analytics <script> tags (Plausible / Matomo / …). Keyed by a
    // JSON string so the effect re-runs only when the list actually changes.
    const scripts = branding?.analytics?.scripts;
    const scriptsKey = Array.isArray(scripts) ? JSON.stringify(scripts) : '';
    useEffect(() => {
        if (!scriptsKey) return;
        const defs = JSON.parse(scriptsKey) as AppConfigAnalyticsScript[];
        const els = defs
            .filter((d) => d && d.src)
            .map((d) => {
                const el = document.createElement('script');
                el.src = d.src;
                if (d.async) el.async = true;
                if (d.defer) el.defer = true;
                if (d.attributes)
                    Object.entries(d.attributes).forEach(([k, v]) =>
                        el.setAttribute(k, String(v))
                    );
                document.head.appendChild(el);
                return el;
            });
        return () => els.forEach((el) => el.remove());
    }, [scriptsKey]);

    // Wait for /api/config before painting the chrome, so the operator's branding
    // (site name, logo, theme) shows immediately instead of flashing the defaults first.
    if (config.isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-panel">
                <i className="fas fa-spinner fa-spin text-2xl text-muted" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-panel">
            <Header />
            <main className="mx-auto w-full max-w-[1280px] flex-1 p-5">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route
                        path="/getting_started"
                        element={<GettingStarted />}
                    />
                    <Route path="/stats" element={<Stats />} />
                    <Route path="/workers" element={<Workers />} />
                    <Route path="/workers/:address" element={<MinerStats />} />
                    <Route path="/payments" element={<Payments />} />
                    <Route
                        path="/tbs"
                        element={
                            tabStatsEnabled(config.data) ? (
                                <TabStats />
                            ) : (
                                <Navigate to="/" replace />
                            )
                        }
                    />
                    <Route path="/api" element={<ApiDocs />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
}
