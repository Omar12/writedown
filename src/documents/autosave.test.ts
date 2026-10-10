import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Autosaver, type SaveState } from './autosave.ts';
import { ConflictError, type DocumentRecord, type saveDocument } from './db.ts';

const record: DocumentRecord = {
	id: 'doc',
	title: 'Untitled',
	markdown: '',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	schemaVersion: 1,
};

type Call = {
	markdown: string;
	base: string | null;
	resolve: () => void;
	reject: (e: unknown) => void;
};

function setup() {
	let text = '';
	const calls: Call[] = [];
	const states: SaveState[] = [];
	const save = ((next, base) =>
		new Promise((resolve, reject) => {
			calls.push({ markdown: next.markdown, base, resolve: () => resolve(next), reject });
		})) as typeof saveDocument;
	const saver = new Autosaver(record, () => ({ title: text, markdown: text, history: [] }), {
		save,
		onState: (s) => states.push(s),
	});
	const type = (value: string) => {
		text = value;
		saver.change();
	};
	return { saver, calls, states, type };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = () => vi.advanceTimersByTimeAsync(0);

test('debounces 500 ms after the last edit and saves the latest text once', async () => {
	const { calls, type } = setup();
	type('a');
	await vi.advanceTimersByTimeAsync(400);
	type('ab');
	await vi.advanceTimersByTimeAsync(499);
	expect(calls).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(1);
	expect(calls.map((c) => c.markdown)).toEqual(['ab']);
});

test('state goes dirty, saving, clean only after the write resolves', async () => {
	const { saver, calls, states, type } = setup();
	type('a');
	expect(saver.state).toBe('dirty');
	await vi.advanceTimersByTimeAsync(500);
	expect(saver.state).toBe('saving');
	calls[0].resolve();
	await tick();
	expect(states).toEqual(['dirty', 'saving', 'clean']);
});

test('a failed write never shows clean; retry recovers', async () => {
	const { saver, calls, type } = setup();
	type('a');
	const flushed = saver.flush();
	await tick();
	calls[0].reject(new DOMException('Quota exceeded', 'QuotaExceededError'));
	expect(await flushed).toBe(false);
	expect(saver.state).toBe('error');

	const retried = saver.flush();
	await tick();
	expect(calls[1].markdown).toBe('a');
	calls[1].resolve();
	expect(await retried).toBe(true);
	expect(saver.state).toBe('clean');
});

test('edits during a save keep it dirty; writes are strictly ordered with the right base', async () => {
	const { saver, calls, type } = setup();
	type('one');
	const first = saver.flush();
	await tick();
	type('two'); // arrives while the first write is in flight
	const second = saver.flush();
	await tick();
	expect(calls).toHaveLength(1); // second waits for first
	calls[0].resolve();
	await tick();
	expect(saver.state).toBe('saving');
	expect(calls[1].markdown).toBe('two');
	expect(calls[1].base).not.toBe(record.updatedAt); // based on the first write's timestamp
	calls[1].resolve();
	expect(await first).toBe(true);
	expect(await second).toBe(true);
	expect(saver.state).toBe('clean');
});

test('conflict stops autosave until resolved; force overwrites with a null base', async () => {
	const { saver, calls, type } = setup();
	type('mine');
	const flushed = saver.flush();
	await tick();
	calls[0].reject(new ConflictError());
	expect(await flushed).toBe(false);
	expect(saver.state).toBe('conflict');

	type('more');
	await vi.advanceTimersByTimeAsync(1000);
	expect(calls).toHaveLength(1);
	expect(await saver.flush()).toBe(false);

	const forced = saver.flush(true);
	await tick();
	expect(calls[1]).toMatchObject({ markdown: 'more', base: null });
	calls[1].resolve();
	expect(await forced).toBe(true);
});

test('dispose cancels a pending save (document switch)', async () => {
	const { saver, calls, type } = setup();
	type('a');
	saver.dispose();
	await vi.advanceTimersByTimeAsync(1000);
	expect(calls).toHaveLength(0);
});

test('flush with nothing changed does not write', async () => {
	const { saver, calls } = setup();
	expect(await saver.flush()).toBe(true);
	expect(calls).toHaveLength(0);
});
