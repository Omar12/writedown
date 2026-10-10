import type { JSONContent } from '@tiptap/core';
import type { HistoryEntry } from '../editor/suggestions.ts';

export type DocumentRecord = {
	id: string; // UUID
	title: string; // derived from the first line
	markdown: string; // durable representation
	createdAt: string; // ISO timestamp
	updatedAt: string; // ISO timestamp, also the optimistic-concurrency token
	schemaVersion: 1;
};

/** Accepted-suggestion history, stored beside the document and never exported. */
export type HistoryRecord = { documentId: string; entries: HistoryEntry[] };

export class ConflictError extends Error {
	constructor() {
		super('Document was changed elsewhere since it was loaded');
	}
}

const DB_NAME = 'writer-local';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
	dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		// Versioned migrations: add a case per future version, never edit old ones.
		request.onupgradeneeded = (event) => {
			const db = request.result;
			if (event.oldVersion < 1) {
				db.createObjectStore('documents', { keyPath: 'id' });
				db.createObjectStore('history', { keyPath: 'documentId' });
			}
		};
		request.onsuccess = () => {
			const db = request.result;
			// Another tab is upgrading the schema; let it, and reopen next time.
			db.onversionchange = () => {
				db.close();
				dbPromise = null;
			};
			resolve(db);
		};
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('Database upgrade blocked by another open tab'));
	}).catch((error) => {
		dbPromise = null; // allow retry
		throw error;
	});
	return dbPromise;
}

/** Test hook: forget the cached connection. */
export function resetDbForTests() {
	dbPromise = null;
}

const result = <T>(request: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

const done = (tx: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = tx.onerror = () =>
			reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
	});

export async function listDocuments(): Promise<DocumentRecord[]> {
	const db = await openDb();
	const docs = await result<DocumentRecord[]>(
		db.transaction('documents').objectStore('documents').getAll(),
	);
	return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadDocument(
	id: string,
): Promise<{ doc: DocumentRecord; history: HistoryEntry[] } | null> {
	const db = await openDb();
	const tx = db.transaction(['documents', 'history']);
	const [doc, history] = await Promise.all([
		result<DocumentRecord | undefined>(tx.objectStore('documents').get(id)),
		result<HistoryRecord | undefined>(tx.objectStore('history').get(id)),
	]);
	return doc ? { doc, history: history?.entries ?? [] } : null;
}

export async function createDocument(): Promise<DocumentRecord> {
	const now = new Date().toISOString();
	const doc: DocumentRecord = {
		id: crypto.randomUUID(),
		title: 'Untitled',
		markdown: '',
		createdAt: now,
		updatedAt: now,
		schemaVersion: 1,
	};
	const db = await openDb();
	const tx = db.transaction('documents', 'readwrite');
	tx.objectStore('documents').add(doc);
	await done(tx);
	return doc;
}

/**
 * Write a document and its history in one transaction. Throws ConflictError, writing nothing,
 * if the stored record's updatedAt no longer equals `baseUpdatedAt` (another tab saved first).
 * Pass `baseUpdatedAt = null` to overwrite deliberately.
 */
export async function saveDocument(
	next: DocumentRecord,
	baseUpdatedAt: string | null,
	history: HistoryEntry[],
): Promise<DocumentRecord> {
	const db = await openDb();
	const tx = db.transaction(['documents', 'history'], 'readwrite');
	const docs = tx.objectStore('documents');
	let failure: unknown = null;
	docs.get(next.id).onsuccess = (event) => {
		const current = (event.target as IDBRequest<DocumentRecord | undefined>).result;
		try {
			if (baseUpdatedAt !== null && current && current.updatedAt !== baseUpdatedAt) {
				throw new ConflictError();
			}
			docs.put(next);
			tx.objectStore('history').put({
				documentId: next.id,
				entries: history,
			} satisfies HistoryRecord);
		} catch (error) {
			// Conflict, or e.g. QuotaExceededError thrown synchronously by put: abort so nothing is half-written.
			failure = error;
			tx.abort();
		}
	};
	try {
		await done(tx);
	} catch (error) {
		throw failure ?? error;
	}
	return next;
}

export async function deleteDocument(id: string): Promise<void> {
	const db = await openDb();
	const tx = db.transaction(['documents', 'history'], 'readwrite');
	tx.objectStore('documents').delete(id);
	tx.objectStore('history').delete(id);
	await done(tx);
}

/** First line of the first block, or "Untitled". */
export function deriveTitle(doc: JSONContent): string {
	const text = (node: JSONContent): string =>
		node.type === 'hardBreak' ? '\n' : (node.text ?? '') + (node.content ?? []).map(text).join('');
	const first = doc.content?.find((block) => text(block).trim());
	const line = first ? text(first).trim().split('\n')[0].trim() : '';
	return line.slice(0, 80) || 'Untitled';
}
