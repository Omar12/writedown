import type { HistoryEntry } from '../editor/suggestions.ts';
import { ConflictError, saveDocument, type DocumentRecord } from './db.ts';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'error' | 'conflict';

export type Snapshot = { title: string; markdown: string; history: HistoryEntry[] };

type Options = {
	delay?: number;
	save?: typeof saveDocument;
	onState?: (state: SaveState) => void;
};

/**
 * Debounced, strictly ordered saves for one open document. A revision is marked saved only
 * after its own write resolves; later edits keep the state dirty. One instance per open
 * document, so a slow write can never land on a document opened afterwards.
 */
export class Autosaver {
	state: SaveState = 'clean';
	private revision = 0;
	private savedRevision = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private chain: Promise<void> = Promise.resolve();
	record: DocumentRecord;
	private readonly snapshot: () => Snapshot;
	private readonly delay: number;
	private readonly save: typeof saveDocument;
	private readonly onState: (state: SaveState) => void;

	constructor(
		record: DocumentRecord,
		snapshot: () => Snapshot,
		{ delay = 500, save = saveDocument, onState = () => {} }: Options = {},
	) {
		this.record = record;
		this.snapshot = snapshot;
		this.delay = delay;
		this.save = save;
		this.onState = onState;
	}

	private set(state: SaveState) {
		this.state = state;
		this.onState(state);
	}

	/** Call on every edit. Serialization happens at save time, not here. */
	change() {
		this.revision++;
		// A conflict stops autosave until the user picks a resolution.
		if (this.state === 'conflict') return;
		this.set('dirty');
		clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.flush(), this.delay);
	}

	/** Save now. Resolves true when everything up to the latest edit is stored. `force` overwrites a conflict. */
	async flush(force = false): Promise<boolean> {
		clearTimeout(this.timer);
		if (this.state === 'conflict' && !force) return false;
		this.chain = this.chain.then(async () => {
			if (this.savedRevision === this.revision && this.state !== 'conflict') return;
			const revision = this.revision;
			const { history, ...content } = this.snapshot();
			this.set('saving');
			try {
				const next = { ...this.record, ...content, updatedAt: new Date().toISOString() };
				this.record = await this.save(next, force ? null : this.record.updatedAt, history);
				this.savedRevision = revision;
				this.set(this.revision === revision ? 'clean' : 'dirty');
			} catch (error) {
				this.set(error instanceof ConflictError ? 'conflict' : 'error');
			}
		});
		await this.chain;
		if (this.state === 'dirty' && this.savedRevision !== this.revision) return this.flush();
		return this.state === 'clean';
	}

	/** The latest edit when it isn't stored yet (dirty, saving or failed); null otherwise. */
	unsaved(): Snapshot | null {
		return this.savedRevision === this.revision ? null : this.snapshot();
	}

	dispose() {
		clearTimeout(this.timer);
	}
}

// Leaving the page: IndexedDB writes started in pagehide are lost in WebKit (and the checked
// save needs a later task that never comes), so keep a synchronous copy. One slot, last page wins.
const STASH_KEY = 'writedown.unsavedEdit';
type Stash = { id: string; base: string; title: string; markdown: string };

/** Keep `record`'s unsaved edit in localStorage until the next open of that document. */
export function stashUnsaved(record: DocumentRecord, { title, markdown }: Snapshot) {
	try {
		const stash: Stash = { id: record.id, base: record.updatedAt, title, markdown };
		localStorage.setItem(STASH_KEY, JSON.stringify(stash));
	} catch {
		// Storage blocked or full: the IndexedDB flush is still attempted.
	}
}

/** The stashed edit for `record`, only if nothing was saved since it was made. Consumes it. */
export function takeUnsaved(record: DocumentRecord): { title: string; markdown: string } | null {
	try {
		const raw = localStorage.getItem(STASH_KEY);
		const stash = raw ? (JSON.parse(raw) as Stash) : null;
		if (stash?.id !== record.id) return null;
		localStorage.removeItem(STASH_KEY);
		// A newer save means the flush landed, or another tab saved after; never overwrite it.
		return stash.base === record.updatedAt
			? { title: stash.title, markdown: stash.markdown }
			: null;
	} catch {
		return null;
	}
}
