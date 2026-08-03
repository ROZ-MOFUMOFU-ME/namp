import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import compress from 'compression';
import api from './api.ts';
import type { Logger } from './logUtil.ts';

// Directory of the built Vite + React SPA (see web/). Everything the browser
// loads — the app and its assets — is served from here, with a catch-all
// fallback to index.html so client-side routes work.
const SPA_DIR = path.resolve('web/dist');
const SPA_INDEX = path.join(SPA_DIR, 'index.html');

/**
 * Stylesheet origins the SPA shell pulls from. Fonts and icon sets come from
 * these CDNs, and their <link> tags live in index.html rather than the
 * bundle, so the policy has to name them explicitly.
 */
const STYLE_CDNS = [
    'https://fonts.googleapis.com',
    'https://cdnjs.cloudflare.com',
    'https://cdn.jsdelivr.net'
];

export default function (this: any, logger: Logger) {
    const portalConfig: any = JSON.parse(process.env.portalConfig as string);
    const poolConfigs: any = JSON.parse(process.env.pools as string);

    const websiteConfig = portalConfig.website;

    const portalApi: any = new (api as any)(logger, portalConfig, poolConfigs);
    const portalStats = portalApi.stats;

    const logSystem = 'Website';

    // Populate the stats snapshot once at startup so /api/stats has data before
    // the first SSE tick, then push the live object to SSE clients on a timer.
    portalStats.getGlobalStats(function () {});

    const buildUpdatedWebsite = function () {
        portalStats.getGlobalStats(function () {
            const statData =
                'data: ' + JSON.stringify(portalStats.stats) + '\n\n';
            for (const uid in portalApi.liveStatConnections) {
                const res = portalApi.liveStatConnections[uid];
                res.write(statData);
            }
        });
    };

    setInterval(buildUpdatedWebsite, websiteConfig.stats.updateInterval * 1000);

    const app = express();

    // Never advertise the server stack.
    app.disable('x-powered-by');

    /*
     * The built index.html carries small inline scripts that must run before
     * first paint (applying the saved theme, setting <html lang>). A bare
     * script-src 'self' blocks them — which silently reverted the page to the
     * light theme on every load — so their hashes go into the policy. Hashing
     * the shipped file keeps the policy strict and self-maintaining.
     */
    const inlineScriptHashes = (function () {
        try {
            const html = fs.readFileSync(SPA_INDEX, 'utf8');
            const hashes: string[] = [];
            const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(html)) !== null) {
                hashes.push(
                    `'sha256-${crypto
                        .createHash('sha256')
                        .update(match[1], 'utf8')
                        .digest('base64')}'`
                );
            }
            return hashes;
        } catch {
            return [];
        }
    })();

    /*
     * Origins the operator's own branding points the browser at: the server
     * cards measure latency by fetching each pingUrl, and analytics loads a
     * third-party script and reports to it. Both are configured per
     * deployment, so the policy is derived from the config rather than
     * guessed — an operator who configures neither gets no extra origins.
     */
    const brandingConfig: any = (websiteConfig && websiteConfig.branding) || {};
    const originOf = function (url: unknown): string | null {
        try {
            return new URL(String(url)).origin;
        } catch {
            return null;
        }
    };
    const configuredConnectOrigins = Array.from(
        new Set(
            [
                ...(((brandingConfig.home || {}).servers || {}).list || []).map(
                    (server: any) => originOf(server && server.pingUrl)
                ),
                ...((brandingConfig.analytics || {}).scripts || []).map(
                    (script: any) => originOf(script && script.src)
                ),
                ...((brandingConfig.analytics || {}).googleAnalyticsId
                    ? [
                          'https://www.googletagmanager.com',
                          'https://www.google-analytics.com',
                          'https://region1.google-analytics.com'
                      ]
                    : [])
            ].filter(Boolean) as string[]
        )
    );
    const configuredScriptOrigins = Array.from(
        new Set(
            [
                ...((brandingConfig.analytics || {}).scripts || []).map(
                    (script: any) => originOf(script && script.src)
                ),
                ...((brandingConfig.analytics || {}).googleAnalyticsId
                    ? ['https://www.googletagmanager.com']
                    : [])
            ].filter(Boolean) as string[]
        )
    );

    // Security headers. The SPA is self-contained (its own bundle, its own
    // /api), so a strict CSP costs nothing here — the one concession is
    // 'unsafe-inline' for styles, which the bundler emits.
    app.use(function (_req: any, res: any, next: any) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader(
            'Content-Security-Policy',
            [
                "default-src 'self'",
                [
                    "script-src 'self'",
                    ...inlineScriptHashes,
                    ...configuredScriptOrigins,
                    // Analytics snippets bootstrap themselves with an inline
                    // script the SPA injects at runtime, so its content is
                    // not known when the shell is hashed.
                    ...(configuredScriptOrigins.length
                        ? ["'unsafe-inline'"]
                        : [])
                ].join(' '),
                // The SPA shell loads its fonts and icon sets from public
                // CDNs (Google Fonts, Font Awesome, flag-icons); a bare
                // 'self' here blocks them and the UI loses every icon.
                ["style-src 'self' 'unsafe-inline'", ...STYLE_CDNS].join(' '),
                // Operator branding (logo/favicon) may point at a CDN.
                "img-src 'self' data: https:",
                "font-src 'self' data: https:",
                ["connect-src 'self'", ...configuredConnectOrigins].join(' '),
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'"
            ].join('; ')
        );
        if (websiteConfig.tlsOptions && websiteConfig.tlsOptions.enabled) {
            res.setHeader(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains'
            );
        }
        next();
    });

    // Bodies here are a password and small admin payloads; an unbounded body
    // is free memory pressure for anyone who can reach the port.
    app.use(express.json({ limit: '64kb' }));
    app.use(express.urlencoded({ extended: true, limit: '64kb' }));
    app.use(compress());

    // JSON / SSE API.
    app.get('/api/:method', function (req, res, next) {
        portalApi.handleApiRequest(req, res, next);
    });

    /**
     * Constant-time password check. A plain === leaks the correct prefix
     * length through response timing, which is enough to recover a password
     * remotely given enough attempts.
     */
    const passwordMatches = function (expected: any, supplied: any): boolean {
        if (typeof expected !== 'string' || typeof supplied !== 'string') {
            return false;
        }
        const a = Buffer.from(expected, 'utf8');
        const b = Buffer.from(supplied, 'utf8');
        // timingSafeEqual demands equal lengths; hash first so a length
        // difference does not short-circuit either.
        return crypto.timingSafeEqual(
            crypto.createHash('sha256').update(a).digest(),
            crypto.createHash('sha256').update(b).digest()
        );
    };

    // Failed admin attempts per IP, so a password cannot be brute-forced at
    // network speed. Cleared on success.
    const adminFailures: Record<string, { count: number; until: number }> = {};
    const ADMIN_MAX_FAILURES = 5;
    const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;

    app.post('/api/admin/:method', function (req, res, next) {
        const adminCenter =
            (portalConfig.website && portalConfig.website.adminCenter) || {};
        if (!adminCenter.enabled) return next();

        const ip = String(
            req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
        )
            .split(',')[0]
            .trim();
        const record = adminFailures[ip];
        if (record && record.count >= ADMIN_MAX_FAILURES) {
            if (Date.now() < record.until) {
                res.status(429).json({ error: 'Too many attempts' });
                return;
            }
            delete adminFailures[ip];
        }

        // An empty or unset password must never authorize anything — the
        // shipped example leaves it blank.
        if (
            typeof adminCenter.password !== 'string' ||
            adminCenter.password.length === 0
        ) {
            logger.warning(
                logSystem,
                'Admin',
                'Admin API is enabled with no password set; refusing every request'
            );
            res.status(401).json({ error: 'Admin password is not configured' });
            return;
        }

        if (passwordMatches(adminCenter.password, req.body.password)) {
            delete adminFailures[ip];
            portalApi.handleAdminApiRequest(req, res, next);
            return;
        }

        const failures = adminFailures[ip] || { count: 0, until: 0 };
        failures.count++;
        failures.until = Date.now() + ADMIN_LOCKOUT_MS;
        adminFailures[ip] = failures;
        logger.warning(
            logSystem,
            'Admin',
            `Failed admin authentication from ${ip} (${failures.count})`
        );
        res.status(401).json({ error: 'Incorrect Password' });
    });

    // Built SPA assets + static files (index.html at /, hashed assets under
    // /assets — all from web/dist via web/public).
    app.use(express.static(SPA_DIR));

    // SPA fallback: any other GET serves the app shell for client-side routing.
    app.use(function (req: any, res: any) {
        res.sendFile(SPA_INDEX);
    });

    app.use(function (err: any, req: any, res: any, next: any) {
        console.error(err.stack);
        res.status(500).send('Something broke!');
    });

    try {
        if (
            portalConfig.website.tlsOptions &&
            portalConfig.website.tlsOptions.enabled === true
        ) {
            const TLSoptions = {
                key: fs.readFileSync(portalConfig.website.tlsOptions.key),
                cert: fs.readFileSync(portalConfig.website.tlsOptions.cert)
            };

            https
                .createServer(TLSoptions, app)
                .listen(
                    portalConfig.website.port,
                    portalConfig.website.host,
                    function () {
                        logger.debug(
                            logSystem,
                            'Server',
                            'TLS Website started on ' +
                                portalConfig.website.host +
                                ':' +
                                portalConfig.website.port
                        );
                    }
                );
        } else {
            app.listen(
                portalConfig.website.port,
                portalConfig.website.host,
                function () {
                    logger.debug(
                        logSystem,
                        'Server',
                        'Website started on ' +
                            portalConfig.website.host +
                            ':' +
                            portalConfig.website.port
                    );
                }
            );
        }
    } catch (e) {
        console.log(e);
        logger.error(
            logSystem,
            'Server',
            'Could not start website on ' +
                portalConfig.website.host +
                ':' +
                portalConfig.website.port +
                ' - its either in use or you do not have permission'
        );
    }
}
