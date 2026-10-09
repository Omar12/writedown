import { expect, test } from 'vitest';
import { app } from './app.ts';

test('GET /api/health returns ok', async () => {
	const res = await app.request('/api/health');
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ status: 'ok' });
});

test('unknown route returns 404', async () => {
	expect((await app.request('/api/nope')).status).toBe(404);
});
