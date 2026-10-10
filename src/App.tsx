import { useEffect, useId, useRef, useState } from 'react';
import { DocumentSwitcher } from './documents/DocumentSwitcher.tsx';
import { ImportDialog, type ImportPrompt } from './documents/ImportDialog.tsx';
import { ImportError, readMarkdownFile, type ParsedImport } from './documents/markdownFile.ts';
import { SaveStatus } from './documents/SaveStatus.tsx';
import { useWorkspace } from './documents/useWorkspace.ts';
import { WritingEditor } from './editor/WritingEditor.tsx';

export function App() {
	const ws = useWorkspace();
	const { workspace, exportCurrent, importDocument } = ws;
	const scrimTitle = useId();
	const fileInput = useRef<HTMLInputElement>(null);
	const [prompt, setPrompt] = useState<ImportPrompt | null>(null);
	const blocked = workspace.phase === 'ready' && workspace.blocked;

	async function importFile(file: File) {
		try {
			const parsed = await readMarkdownFile(file);
			if (parsed.warnings.length) setPrompt({ kind: 'confirm', fileName: file.name, parsed });
			else await importDocument(parsed);
		} catch (error) {
			const message = error instanceof ImportError ? error.message : 'The file could not be read.';
			setPrompt({ kind: 'error', message });
		}
	}

	async function confirmImport(parsed: ParsedImport) {
		setPrompt(null);
		await importDocument(parsed);
	}

	// Export shortcut works wherever focus is. Shift+Mod+E, not Mod+S, so the browser's own save is untouched.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
				e.preventDefault();
				exportCurrent();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [exportCurrent]);

	const canImport = workspace.phase === 'ready' || workspace.phase === 'empty';

	return (
		<>
			<main
				inert={blocked}
				onDragOver={(e) =>
					canImport && e.dataTransfer.types.includes('Files') && e.preventDefault()
				}
				onDrop={(e) => {
					if (!canImport || !e.dataTransfer.files.length) return;
					e.preventDefault();
					void importFile(e.dataTransfer.files[0]);
				}}
			>
				<h1 className="visually-hidden">Writedown</h1>
				<input
					ref={fileInput}
					type="file"
					accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						e.target.value = ''; // allow re-importing the same file
						if (file) void importFile(file);
					}}
				/>
				{workspace.phase === 'empty' && (
					<div className="empty-state">
						<p>No documents yet.</p>
						<button type="button" onClick={() => void ws.create()}>
							New document
						</button>
						<button type="button" onClick={() => fileInput.current?.click()}>
							Import .md…
						</button>
						<p className="hint">or drop a Markdown file here</p>
					</div>
				)}
				{workspace.phase === 'unavailable' && (
					<>
						<div className="storage-banner" role="alert">
							Browser storage is unavailable (private browsing or blocked site data). You can write,
							but nothing will be saved.
							<button type="button" onClick={exportCurrent}>
								Export .md
							</button>
						</div>
						<WritingEditor onReady={ws.onEditorReady} />
					</>
				)}
				{workspace.phase === 'ready' && (
					<WritingEditor
						key={workspace.editorKey}
						documentId={workspace.doc.id}
						initialMarkdown={workspace.doc.markdown}
						initialHistory={workspace.history}
						editable={!workspace.blocked}
						onUpdate={ws.onEditorUpdate}
						onReady={ws.onEditorReady}
						leading={
							<DocumentSwitcher
								current={workspace.doc}
								onOpen={(id) => void ws.open(id)}
								onCreate={() => void ws.create()}
								onDelete={(id) => void ws.remove(id)}
								onImport={() => fileInput.current?.click()}
								onExport={exportCurrent}
							/>
						}
						trailing={
							<SaveStatus
								state={workspace.saveState}
								onRetry={ws.retry}
								onKeepMine={ws.keepMine}
								onLoadLatest={ws.loadLatest}
								onExport={exportCurrent}
							/>
						}
					/>
				)}
			</main>
			{prompt && (
				<ImportDialog
					prompt={prompt}
					onConfirm={(p) => void confirmImport(p)}
					onClose={() => setPrompt(null)}
				/>
			)}
			{blocked && (
				<div className="scrim">
					<div
						role="alertdialog"
						aria-modal="true"
						aria-labelledby={scrimTitle}
						className="scrim-card"
					>
						<p id={scrimTitle}>“{workspace.doc.title}” is open in another tab.</p>
						<button type="button" autoFocus onClick={ws.editHere}>
							Edit here instead
						</button>
					</div>
				</div>
			)}
		</>
	);
}
