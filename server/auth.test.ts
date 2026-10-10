import { expect, test } from 'vitest';
import { testApp } from './testing.ts';
import { resendMailer } from './auth.ts';

test('allowlisted email gets a link; others get the same 202 and no link', async () => {
	const t = testApp();
	expect((await t.postJson('/auth/request', { email: 'Alice@Example.com ' })).status).toBe(202);
	expect(t.links).toHaveLength(1);
	expect(t.links[0]).toMatch(/^http:\/\/localhost:5173\/api\/auth\/verify\?token=/);
	const other = await t.postJson('/auth/request', { email: 'mallory@example.com' });
	expect(other.status).toBe(202);
	expect(await other.json()).toEqual({ ok: true });
	expect(t.links).toHaveLength(1);
});

test('invalid email 400; sixth request in an hour 429', async () => {
	const t = testApp();
	expect((await t.postJson('/auth/request', { email: 'not-an-email' })).status).toBe(400);
	for (let i = 0; i < 5; i++)
		expect((await t.postJson('/auth/request', { email: 'alice@example.com' })).status).toBe(202);
	expect((await t.postJson('/auth/request', { email: 'alice@example.com' })).status).toBe(429);
});

test('no mailer configured: 503', async () => {
	const t = testApp({ mailer: null });
	expect((await t.postJson('/auth/request', { email: 'alice@example.com' })).status).toBe(503);
});

test('GET on the link does not consume it (mail scanners); POST signs in once', async () => {
	const t = testApp();
	await t.postJson('/auth/request', { email: 'alice@example.com' });
	const path = t.links[0].replace('http://localhost:5173/api', '');
	const page = await t.request(path);
	expect(page.status).toBe(200);
	expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
	// Without this, browsers post the form with "Origin: null" and the CSRF check rejects it.
	expect(await page.text()).toContain('<meta name="referrer" content="same-origin">');
	await t.request(path); // second prefetch
	const token = new URL(t.links[0]).searchParams.get('token')!;
	const verify = (tok: string) =>
		t.request('/auth/verify', {
			method: 'POST',
			body: new URLSearchParams({ token: tok }),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
	const res = await verify(token);
	expect(res.status).toBe(303);
	const cookie = res.headers.get('set-cookie')!;
	expect(cookie).toMatch(/HttpOnly/i);
	expect(cookie).toMatch(/SameSite=Lax/i);
	expect((await verify(token)).status).toBe(400); // single use
	expect((await verify('forged')).status).toBe(400);
});

test('expired login token is rejected', async () => {
	const t = testApp();
	const token = t.store.createLoginToken('alice@example.com', -1);
	const res = await t.request('/auth/verify', {
		method: 'POST',
		body: new URLSearchParams({ token }),
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
	});
	expect(res.status).toBe(400);
});

test('session: /me works, logout ends it, removal from allowlist revokes access', async () => {
	const t = testApp();
	expect((await t.request('/auth/me')).status).toBe(401);
	const cookie = await t.signIn();
	expect(await (await t.request('/auth/me', { cookie })).json()).toEqual({
		email: 'alice@example.com',
	});
	t.config.allowlist.delete('alice@example.com');
	expect((await t.request('/auth/me', { cookie })).status).toBe(403);
	t.config.allowlist.add('alice@example.com');
	expect((await t.request('/auth/logout', { method: 'POST', cookie })).status).toBe(204);
	expect((await t.request('/auth/me', { cookie })).status).toBe(401);
});

test('cross-origin POSTs are refused', async () => {
	const t = testApp();
	const res = await t.app.request('/api/auth/request', {
		method: 'POST',
		body: JSON.stringify({ email: 'alice@example.com' }),
		headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
	});
	expect(res.status).toBe(403);
	expect(t.links).toHaveLength(0);
});

test('resendMailer posts the link to Resend and throws on a non-2xx reply', async () => {
	const calls: [string, RequestInit][] = [];
	let status = 200;
	const fakeFetch = (async (url: string, init: RequestInit) => {
		calls.push([url, init]);
		return new Response('{}', { status });
	}) as typeof fetch;
	const mailer = resendMailer('re_test', 'Writedown <signin@example.com>', fakeFetch);
	await mailer.sendSignInLink('alice@example.com', 'http://x/verify?token=abc');
	const [url, init] = calls[0];
	expect(url).toBe('https://api.resend.com/emails');
	expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
	const body = JSON.parse(init.body as string);
	expect(body.to).toEqual(['alice@example.com']);
	expect(body.text).toContain('http://x/verify?token=abc');
	status = 422;
	await expect(mailer.sendSignInLink('alice@example.com', 'l')).rejects.toThrow('resend 422');
});

test('mail send failure still answers 202 (no allowlist leak)', async () => {
	const t = testApp({ mailer: { sendSignInLink: async () => Promise.reject(new Error('down')) } });
	expect((await t.postJson('/auth/request', { email: 'alice@example.com' })).status).toBe(202);
});
