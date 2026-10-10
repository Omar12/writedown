import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { serializeMarkdown } from '../editor/markdown.ts';
import { getSuggestionHistory, type HistoryEntry } from '../editor/suggestions.ts';
import { Autosaver, type SaveState } from './autosave.ts';
import {
	createDocument,
	deleteDocument,
	deriveTitle,
	listDocuments,
	loadDocument,
	type DocumentRecord,
} from './db.ts';
import { openTabChannel, type TabMessage } from './tabs.ts';

export type Workspace =
	| { phase: 'loading' }
	| { phase: 'unavailable' }
	| { phase: 'empty' }
	| {
			phase: 'ready';
			doc: DocumentRecord;
			history: HistoryEntry[];
			/** Changes whenever the editor must remount with fresh content. */
			editorKey: string;
			saveState: SaveState;
			/** This document was claimed by another tab; this tab is read-only behind a scrim. */
			blocked: boolean;
	  };

export function useWorkspace() {
	const [workspace, setWorkspace] = useState<Workspace>({ phase: 'loading' });
	const saver = useRef<Autosaver | null>(null);
	const editor = useRef<Editor | null>(null);
	const channel = useRef<ReturnType<typeof openTabChannel> | null>(null);
	const loads = useRef(0);

	// The saved record carries the new title and updatedAt.
	const setSaveState = (saveState: SaveState, doc: DocumentRecord) =>
		setWorkspace((w) =>
			w.phase === 'ready' && w.doc.id === doc.id ? { ...w, saveState, doc } : w,
		);

	/** Load a document into a fresh editor. Callers flush the previous one first when it matters. */
	const show = useCallback(async (id: string, { claim = true } = {}) => {
		const loaded = await loadDocument(id);
		if (!loaded) return false;
		saver.current?.dispose();
		editor.current = null;
		const next = new Autosaver(
			loaded.doc,
			() => {
				const json = editor.current!.getJSON();
				return {
					title: deriveTitle(json),
					markdown: serializeMarkdown(json),
					history: getSuggestionHistory(editor.current!),
				};
			},
			{ onState: (state) => saver.current === next && setSaveState(state, next.record) },
		);
		saver.current = next;
		setWorkspace({
			phase: 'ready',
			doc: loaded.doc,
			history: loaded.history,
			editorKey: `${id}:${++loads.current}`,
			saveState: 'clean',
			blocked: false,
		});
		if (claim) channel.current?.post({ type: 'claim', docId: id });
		return true;
	}, []);

	const showMostRecent = useCallback(async () => {
		const [latest] = await listDocuments();
		if (latest) await show(latest.id);
		else {
			saver.current?.dispose();
			saver.current = null;
			setWorkspace({ phase: 'empty' });
		}
	}, [show]);

	/** Save the current document; false means it could not be saved and must stay open. */
	const flush = useCallback(async () => (saver.current ? saver.current.flush() : true), []);

	const open = useCallback(async (id: string) => (await flush()) && show(id), [flush, show]);

	const create = useCallback(async () => {
		if (!(await flush())) return false;
		return show((await createDocument()).id);
	}, [flush, show]);

	const remove = useCallback(
		async (id: string) => {
			const isCurrent = saver.current?.record.id === id;
			if (isCurrent) saver.current!.dispose();
			await deleteDocument(id);
			channel.current?.post({ type: 'deleted', docId: id });
			if (isCurrent) await showMostRecent();
		},
		[showMostRecent],
	);

	const onEditorUpdate = useCallback((e: Editor) => {
		editor.current = e;
		saver.current?.change();
	}, []);

	const retry = useCallback(() => void saver.current?.flush(), []);
	const keepMine = useCallback(() => void saver.current?.flush(true), []);
	const loadLatest = useCallback(() => {
		const id = saver.current?.record.id;
		if (id) void show(id, { claim: false });
	}, [show]);
	/** Leave the scrim: reload what the other tab saved, then claim the document here. */
	const editHere = useCallback(() => {
		const id = saver.current?.record.id;
		if (id) void show(id);
	}, [show]);

	useEffect(() => {
		const onMessage = async (message: TabMessage) => {
			const current = saver.current;
			if (!current || message.docId !== current.record.id) return;
			if (message.type === 'claim') {
				setWorkspace((w) => (w.phase === 'ready' ? { ...w, blocked: true } : w));
				await current.flush();
				channel.current?.post({
					type: 'released',
					docId: message.docId,
					updatedAt: current.record.updatedAt,
				});
			} else if (message.type === 'released') {
				// The other tab saved after we opened; pick up its content if we have nothing unsaved.
				if (current.state === 'clean' && message.updatedAt > current.record.updatedAt) {
					void show(message.docId, { claim: false });
				}
			} else if (message.type === 'deleted') {
				current.dispose();
				void showMostRecent();
			}
		};
		channel.current = openTabChannel((m) => void onMessage(m));

		const save = () => void saver.current?.flush();
		const onVisibility = () => document.visibilityState === 'hidden' && save();
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', save);

		// Best effort; export (WD-006) remains the only portable backup.
		void navigator.storage?.persist?.().catch(() => {});
		Promise.resolve()
			.then(showMostRecent)
			.catch(() => setWorkspace({ phase: 'unavailable' }));

		return () => {
			channel.current?.close();
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', save);
			saver.current?.dispose();
		};
	}, [show, showMostRecent]);

	return { workspace, open, create, remove, retry, keepMine, loadLatest, editHere, onEditorUpdate };
}
