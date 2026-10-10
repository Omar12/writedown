import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Config } from './config.ts';
import type { Store } from './store.ts';

export type Mailer = { sendSignInLink(email: string, link: string): Promise<void> };

/** Development only: prints the link instead of emailing it. */
export const consoleMailer: Mailer = {
	async sendSignInLink(email, link) {
		console.log(`[dev] sign-in link for ${email}: ${link}`);
	},
};

/** Sends sign-in links through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function resendMailer(apiKey: string, from: string, fetchImpl = fetch): Mailer {
	return {
		async sendSignInLink(email, link) {
			const res = await fetchImpl('https://api.resend.com/emails', {
				method: 'POST',
				headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					from,
					to: [email],
					subject: 'Your Writedown sign-in link',
					text: `Open this link to sign in to Writedown. It expires in 15 minutes and works once.\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
				}),
				signal: AbortSignal.timeout(10_000),
			});
			if (!res.ok) throw new Error(`resend ${res.status}`);
		},
	};
}

const LOGIN_TTL = 15 * 60_000;
const SESSION_TTL = 30 * 24 * 60 * 60_000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;

export type AuthEnv = { Variables: { email: string } };

export function sessionCookieName(config: Config) {
	// __Host- prefix pins the cookie to this exact origin over HTTPS.
	return config.production ? '__Host-wd_session' : 'wd_session';
}

/** Rejects cross-site requests: browsers always send Origin on POST, and it must be our app. */
export const sameOrigin =
	(config: Config): MiddlewareHandler =>
	async (c, next) => {
		const origin = c.req.header('origin');
		if (origin !== undefined && origin !== config.appOrigin)
			return c.json({ error: 'forbidden_origin' }, 403);
		await next();
	};

/** 401 without a valid session; 403 if the email was removed from the allowlist since sign-in. */
export const requireUser =
	(config: Config, store: Store): MiddlewareHandler<AuthEnv> =>
	async (c, next) => {
		const token = getCookie(c, sessionCookieName(config));
		const email = token ? store.sessionEmail(token) : null;
		if (!email) return c.json({ error: 'unauthenticated' }, 401);
		if (!config.allowlist.has(email)) return c.json({ error: 'not_allowlisted' }, 403);
		c.set('email', email);
		await next();
	};

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const page = (c: Context, status: 200 | 400, body: string) =>
	c.html(
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in · Writedown</title></head><body style="font-family:system-ui;max-width:28rem;margin:20vh auto;padding:0 1rem">${body}</body></html>`,
		status,
		{ 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" },
	);

export function authRoutes(config: Config, store: Store, mailer: Mailer | null) {
	const app = new Hono<AuthEnv>();
	const cookie = sessionCookieName(config);

	app.post('/request', sameOrigin(config), async (c) => {
		const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
		const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
		if (!EMAIL.test(email) || email.length > 254) return c.json({ error: 'invalid_email' }, 400);
		if (!mailer) return c.json({ error: 'mail_unavailable' }, 503);
		// Throttle per address and overall so the endpoint can't be used to spam inboxes.
		if (store.countLoginRequests(`email:${email}`, 60 * 60_000) > 5)
			return c.json({ error: 'rate_limited' }, 429);
		if (store.countLoginRequests('all', 60 * 60_000) > 200)
			return c.json({ error: 'rate_limited' }, 429);
		// Same response whether or not the address is allowed, so the allowlist can't be probed.
		if (config.allowlist.has(email)) {
			const token = store.createLoginToken(email, LOGIN_TTL);
			// A send failure still answers 202: a different status would reveal the address is allowlisted.
			await mailer
				.sendSignInLink(
					email,
					`${config.appOrigin}/api/auth/verify?token=${encodeURIComponent(token)}`,
				)
				.catch((e: unknown) => console.error(`sign-in mail failed: ${(e as Error).message}`));
		}
		return c.json({ ok: true }, 202);
	});

	// The emailed link opens a confirm page instead of signing in directly, because mail scanners
	// prefetch links (GET) and would otherwise burn the single-use token.
	app.get('/verify', (c) => {
		const token = c.req.query('token') ?? '';
		return page(
			c,
			200,
			`<h1>Sign in to Writedown</h1><form method="post" action="/api/auth/verify"><input type="hidden" name="token" value="${escape(token)}"><button type="submit">Sign in</button></form>`,
		);
	});

	app.post('/verify', sameOrigin(config), async (c) => {
		const form = await c.req.parseBody();
		const token = typeof form.token === 'string' ? form.token : '';
		const email = token ? store.consumeLoginToken(token) : null;
		if (!email || !config.allowlist.has(email)) {
			return page(
				c,
				400,
				'<h1>This sign-in link has expired</h1><p>Request a new link from Writedown.</p>',
			);
		}
		setCookie(c, cookie, store.createSession(email, SESSION_TTL), {
			httpOnly: true,
			secure: config.production,
			sameSite: 'Lax',
			path: '/',
			maxAge: SESSION_TTL / 1000,
		});
		return c.redirect('/', 303);
	});

	app.post('/logout', sameOrigin(config), (c) => {
		const token = getCookie(c, cookie);
		if (token) store.deleteSession(token);
		deleteCookie(c, cookie, { path: '/', secure: config.production });
		return c.body(null, 204);
	});

	app.get('/me', requireUser(config, store), (c) => c.json({ email: c.get('email') }));

	return app;
}
