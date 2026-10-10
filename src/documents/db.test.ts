import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { HistoryEntry } from '../editor/suggestions.ts';
import {
	ConflictError,
	createDocument,
	deleteDocument,
	deriveTitle,
	listDocuments,
	loadDocument,
	openDb,
	resetDbForTests,
	saveDocument,
	type DocumentRecord,
} from './db.ts';

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetDbForTests();
});
afterEach(() => vi.unstubAllGlobals());

const entry: HistoryEntry = {
	id: 's1',
	documentId: 'x',
	original: [{ type: 'text', text: 'She go' }],
	originalText: 'She go',
	proposed: 'She goes',
	acceptedAt: '2026-10-09T00:00:00.000Z',
};

async function edit(
	doc: DocumentRecord,
	markdown: string,
	history: HistoryEntry[] = [],
	at = new Date(),
) {
	return saveDocument(
		{ ...doc, markdown, title: markdown, updatedAt: at.toISOString() },
		doc.updatedAt,
		history,
	);
}

describe('documents', () => {
	test('two documents persist independently across a reconnect (reload)', async () => {
		const a = await createDocument();
		const b = await createDocument();
		expect(a.id).not.toBe(b.id);
		await edit(a, 'Alpha');
		await edit(b, 'Beta');

		resetDbForTests(); // fresh connection, same data, like a reload
		expect((await loadDocument(a.id))!.doc.markdown).toBe('Alpha');
		expect((await loadDocument(b.id))!.doc.markdown).toBe('Beta');
	});

	test('list is ordered most recently edited first', async () => {
		const a = await createDocument();
		const b = await createDocument();
		await edit(a, 'A', [], new Date('2030-01-02'));
		await edit(b, 'B', [], new Date('2030-01-01'));
		expect((await listDocuments()).map((d) => d.id)).toEqual([a.id, b.id]);
	});

	test('delete removes only that document and its history', async () => {
		const a = await createDocument();
		const b = await createDocument();
		await edit(a, 'A', [entry]);
		await edit(b, 'B', [entry]);
		await deleteDocument(a.id);
		expect(await loadDocument(a.id)).toBeNull();
		expect((await loadDocument(b.id))!.history).toEqual([entry]);
		expect((await listDocuments()).map((d) => d.id)).toEqual([b.id]);
	});

	test('history is stored beside the document, not inside its Markdown', async () => {
		const a = await createDocument();
		await edit(a, 'She goes home.', [entry]);
		const loaded = (await loadDocument(a.id))!;
		expect(loaded.history).toEqual([entry]);
		expect(loaded.doc.markdown).toBe('She goes home.');
		expect(JSON.stringify(loaded.doc)).not.toContain('She go"');
	});
});

describe('conflicts', () => {
	test('stale base is rejected and nothing is written', async () => {
		const a = await createDocument();
		const fromTabOne = await edit(a, 'tab one', [], new Date('2030-01-01'));
		await expect(
			edit(a, 'tab two (stale)', [entry], new Date('2030-01-02')),
		).rejects.toBeInstanceOf(ConflictError);
		const loaded = (await loadDocument(a.id))!;
		expect(loaded.doc).toEqual(fromTabOne);
		expect(loaded.history).toEqual([]);
	});

	test('null base overwrites deliberately', async () => {
		const a = await createDocument();
		await edit(a, 'tab one', [], new Date('2030-01-01'));
		await saveDocument(
			{ ...a, markdown: 'mine', updatedAt: new Date('2030-01-02').toISOString() },
			null,
			[],
		);
		expect((await loadDocument(a.id))!.doc.markdown).toBe('mine');
	});
});

describe('storage failures', () => {
	function failingFactory(event: 'error' | 'blocked') {
		return {
			open() {
				const request = {
					error: new DOMException('nope', 'UnknownError'),
				} as unknown as IDBOpenDBRequest;
				setTimeout(() =>
					(event === 'error' ? request.onerror : request.onblocked)?.call(
						request,
						new Event(event) as never,
					),
				);
				return request;
			},
		};
	}

	test.each(['error', 'blocked'] as const)(
		'open %s rejects, and a later retry can succeed',
		async (event) => {
			const real = globalThis.indexedDB;
			vi.stubGlobal('indexedDB', failingFactory(event));
			await expect(openDb()).rejects.toBeTruthy();
			vi.stubGlobal('indexedDB', real);
			await expect(openDb()).resolves.toBeTruthy();
		},
	);
});

describe('quota failure', () => {
	test('a put that throws rejects the save and writes nothing', async () => {
		const a = await createDocument();
		const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
			throw new DOMException('Quota exceeded', 'QuotaExceededError');
		});
		await expect(edit(a, 'too big', [entry])).rejects.toMatchObject({ name: 'QuotaExceededError' });
		put.mockRestore();
		const loaded = (await loadDocument(a.id))!;
		expect(loaded.doc).toEqual(a);
		expect(loaded.history).toEqual([]);
	});
});

describe('deriveTitle', () => {
	test.each([
		[
			{
				type: 'doc',
				content: [{ type: 'heading', content: [{ type: 'text', text: '  My Title ' }] }],
			},
			'My Title',
		],
		[
			{
				type: 'doc',
				content: [
					{ type: 'paragraph' },
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'First' },
							{ type: 'hardBreak' },
							{ type: 'text', text: 'second' },
						],
					},
				],
			},
			'First',
		],
		[{ type: 'doc', content: [{ type: 'paragraph' }] }, 'Untitled'],
		[
			{
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(200) }] }],
			},
			'x'.repeat(80),
		],
	])('%#', (doc, title) => {
		expect(deriveTitle(doc)).toBe(title);
	});
});
