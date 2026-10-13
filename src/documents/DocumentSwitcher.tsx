import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { disclosureAccepted } from '../ai/AiMenu.tsx';
import { setAutoProofread, signOut, useAccount, useAutoProofread } from '../ai/api.ts';
import { listDocuments, type DocumentRecord } from './db.ts';

type Props = {
	current: DocumentRecord;
	onOpen: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
	onImport: () => void;
	onExport: () => void;
};

/** Disclosure popover listing documents, most recently edited first. Delete asks for confirmation inline. */
export function DocumentSwitcher({
	current,
	onOpen,
	onCreate,
	onDelete,
	onImport,
	onExport,
}: Props) {
	const [open, setOpen] = useState(false);
	const [docs, setDocs] = useState<DocumentRecord[]>([]);
	const [confirming, setConfirming] = useState<string | null>(null);
	const account = useAccount();
	const autoOn = useAutoProofread();
	const autoHint = useId();
	// Background checks send text, so they need the data notice and a signed-in account first.
	const autoAllowed = !!account && disclosureAccepted();
	const panelId = useId();
	const trigger = useRef<HTMLButtonElement>(null);
	const panel = useRef<HTMLDivElement>(null);

	// Read fresh on every open: other tabs may have added, renamed or deleted documents.
	useEffect(() => {
		if (!open) return;
		let live = true;
		listDocuments().then((list) => live && setDocs(list));
		return () => {
			live = false;
		};
	}, [open]);

	useEffect(() => {
		if (open) panel.current?.querySelector<HTMLElement>('[aria-current="true"], button')?.focus();
	}, [open, docs]);

	function close() {
		setOpen(false);
		setConfirming(null);
		trigger.current?.focus();
	}

	const choose = (action: () => void) => () => {
		setOpen(false);
		setConfirming(null);
		action();
	};

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}

	return (
		<div className="switcher" onKeyDown={onKeyDown}>
			<button
				ref={trigger}
				type="button"
				className="switcher-trigger"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => (open ? close() : setOpen(true))}
			>
				<span className="visually-hidden">Documents: </span>
				{current.title} <span aria-hidden="true">▾</span>
			</button>
			{open && (
				<div
					id={panelId}
					ref={panel}
					className="switcher-panel"
					role="group"
					aria-label="Documents"
					onBlur={(e) =>
						!e.currentTarget.parentElement!.contains(e.relatedTarget) &&
						(setOpen(false), setConfirming(null))
					}
				>
					<button type="button" className="switcher-new" onClick={choose(onCreate)}>
						+ New document
					</button>
					<button type="button" className="switcher-new" onClick={choose(onImport)}>
						Import .md…
					</button>
					<button
						type="button"
						className="switcher-new"
						aria-keyshortcuts="Meta+Shift+E Control+Shift+E"
						onClick={choose(onExport)}
					>
						Export .md <kbd aria-hidden="true">⇧⌘E</kbd>
					</button>
					<button
						type="button"
						role="switch"
						className="switcher-new"
						aria-checked={autoOn && autoAllowed}
						aria-disabled={!autoAllowed || undefined}
						aria-describedby={autoAllowed ? undefined : autoHint}
						onClick={() => autoAllowed && setAutoProofread(!autoOn)}
					>
						Check as I write <span aria-hidden="true">{autoOn && autoAllowed ? 'On' : 'Off'}</span>
					</button>
					{!autoAllowed && (
						<p id={autoHint} className="switcher-hint">
							Use AI once (⌘J) and sign in to turn this on.
						</p>
					)}
					{account && (
						<button type="button" className="switcher-new" onClick={choose(() => void signOut())}>
							Sign out of AI <span className="switcher-email">{account.email}</span>
						</button>
					)}
					<ul>
						{docs.map((d) =>
							confirming === d.id ? (
								<li key={d.id} className="switcher-confirm" role="alert">
									<span>Delete “{d.title}”? This can’t be undone.</span>
									<button type="button" onClick={choose(() => onDelete(d.id))}>
										Delete
									</button>
									<button type="button" autoFocus onClick={() => setConfirming(null)}>
										Cancel
									</button>
								</li>
							) : (
								<li key={d.id}>
									<button
										type="button"
										className="switcher-doc"
										aria-current={d.id === current.id || undefined}
										onClick={choose(() => d.id !== current.id && onOpen(d.id))}
									>
										{d.title}
									</button>
									<button
										type="button"
										className="switcher-delete"
										aria-label={`Delete ${d.title}`}
										title="Delete"
										onClick={() => setConfirming(d.id)}
									>
										×
									</button>
								</li>
							),
						)}
					</ul>
				</div>
			)}
		</div>
	);
}
