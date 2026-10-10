import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// ponytail: node:sqlite (experimental in Node 24) on a single instance; move to a hosted DB if the server scales out.

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

const MICRO = 1_000_000; // money stored as integer micro-dollars

export function openStore(path: string) {
	const db = new DatabaseSync(path);
	db.exec(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS login_tokens (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS daily_requests (email TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (email, day));
		CREATE TABLE IF NOT EXISTS monthly_spend (month TEXT PRIMARY KEY, spent INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE IF NOT EXISTS login_requests (key TEXT NOT NULL, at INTEGER NOT NULL);
	`);

	const day = (now: number) => new Date(now).toISOString().slice(0, 10);
	const month = (now: number) => new Date(now).toISOString().slice(0, 7);

	return {
		/** Single-use sign-in token; only its hash is stored. */
		createLoginToken(email: string, ttlMs: number, now = Date.now()) {
			const token = newToken();
			db.prepare('INSERT INTO login_tokens VALUES (?, ?, ?)').run(
				hashToken(token),
				email,
				now + ttlMs,
			);
			return token;
		},
		/** Returns the email and deletes the token (single use), or null if unknown/expired. */
		consumeLoginToken(token: string, now = Date.now()): string | null {
			const row = db
				.prepare('DELETE FROM login_tokens WHERE hash = ? RETURNING email, expires_at')
				.get(hashToken(token)) as { email: string; expires_at: number } | undefined;
			return row && row.expires_at > now ? row.email : null;
		},
		/** Counts sign-in requests per key within a window, recording this one. */
		countLoginRequests(key: string, windowMs: number, now = Date.now()) {
			db.prepare('DELETE FROM login_requests WHERE at < ?').run(now - windowMs);
			db.prepare('INSERT INTO login_requests VALUES (?, ?)').run(key, now);
			return (
				db.prepare('SELECT COUNT(*) AS n FROM login_requests WHERE key = ?').get(key) as {
					n: number;
				}
			).n;
		},
		createSession(email: string, ttlMs: number, now = Date.now()) {
			const token = newToken();
			db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hashToken(token), email, now + ttlMs);
			return token;
		},
		sessionEmail(token: string, now = Date.now()): string | null {
			const row = db
				.prepare('SELECT email, expires_at FROM sessions WHERE hash = ?')
				.get(hashToken(token)) as { email: string; expires_at: number } | undefined;
			return row && row.expires_at > now ? row.email : null;
		},
		deleteSession(token: string) {
			db.prepare('DELETE FROM sessions WHERE hash = ?').run(hashToken(token));
		},
		/** Atomically count one request for today; false (not counted) if the limit is reached. */
		takeDailyRequest(email: string, limit: number, now = Date.now()): boolean {
			const row = db
				.prepare(
					`INSERT INTO daily_requests VALUES (?, ?, 1)
					 ON CONFLICT (email, day) DO UPDATE SET count = count + 1 WHERE count < ?
					 RETURNING count`,
				)
				.get(email, day(now), limit) as { count: number } | undefined;
			return row !== undefined;
		},
		/**
		 * Reserve a worst-case cost against this month's budget before calling the provider.
		 * False if spent + reserved + this would exceed the budget.
		 */
		reserveSpend(usd: number, budgetUsd: number, now = Date.now()): boolean {
			const amount = Math.ceil(usd * MICRO);
			const row = db
				.prepare(
					`INSERT INTO monthly_spend (month, reserved) SELECT ?, ? WHERE ? <= ?
					 ON CONFLICT (month) DO UPDATE SET reserved = reserved + excluded.reserved
					 WHERE spent + reserved + excluded.reserved <= ?
					 RETURNING month`,
				)
				.get(month(now), amount, amount, budgetUsd * MICRO, budgetUsd * MICRO);
			return row !== undefined;
		},
		/** Replace a reservation with the actual cost (0 if the call failed before billing). */
		settleSpend(reservedUsd: number, actualUsd: number, now = Date.now()) {
			db.prepare(
				'UPDATE monthly_spend SET reserved = MAX(0, reserved - ?), spent = spent + ? WHERE month = ?',
			).run(Math.ceil(reservedUsd * MICRO), Math.ceil(actualUsd * MICRO), month(now));
		},
		monthlySpendUsd(now = Date.now()) {
			const row = db.prepare('SELECT spent FROM monthly_spend WHERE month = ?').get(month(now)) as
				{ spent: number } | undefined;
			return (row?.spent ?? 0) / MICRO;
		},
		close: () => db.close(),
	};
}

export type Store = ReturnType<typeof openStore>;
