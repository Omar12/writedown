import { useId } from 'react';
import { DocumentSwitcher } from './documents/DocumentSwitcher.tsx';
import { SaveStatus } from './documents/SaveStatus.tsx';
import { useWorkspace } from './documents/useWorkspace.ts';
import { WritingEditor } from './editor/WritingEditor.tsx';

export function App() {
	const ws = useWorkspace();
	const { workspace } = ws;
	const scrimTitle = useId();

	return (
		<>
			<main inert={workspace.phase === 'ready' && workspace.blocked}>
				<h1 className="visually-hidden">Writedown</h1>
				{workspace.phase === 'empty' && (
					<div className="empty-state">
						<p>No documents yet.</p>
						<button type="button" onClick={() => void ws.create()}>
							New document
						</button>
					</div>
				)}
				{workspace.phase === 'unavailable' && (
					<>
						<p className="storage-banner" role="alert">
							Browser storage is unavailable (private browsing or blocked site data). You can write,
							but nothing will be saved.
						</p>
						<WritingEditor />
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
						leading={
							<DocumentSwitcher
								current={workspace.doc}
								onOpen={(id) => void ws.open(id)}
								onCreate={() => void ws.create()}
								onDelete={(id) => void ws.remove(id)}
							/>
						}
						trailing={
							<SaveStatus
								state={workspace.saveState}
								onRetry={ws.retry}
								onKeepMine={ws.keepMine}
								onLoadLatest={ws.loadLatest}
							/>
						}
					/>
				)}
			</main>
			{workspace.phase === 'ready' && workspace.blocked && (
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
