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

	dispose() {
		clearTimeout(this.timer);
	}
}
