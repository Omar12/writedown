import { useEffect, useId, useRef } from 'react';
import type { ParsedImport } from './markdownFile.ts';
import { unsupportedEffects } from './markdownFile.ts';

export type ImportPrompt =
	{ kind: 'confirm'; fileName: string; parsed: ParsedImport } | { kind: 'error'; message: string };

type Props = {
	prompt: ImportPrompt;
	onConfirm: (parsed: ParsedImport) => void;
	onClose: () => void;
};

/** Modal shown before importing a file with unsupported syntax, or when a file can't be imported. */
export function ImportDialog({ prompt, onConfirm, onClose }: Props) {
	const dialog = useRef<HTMLDialogElement>(null);
	const titleId = useId();

	useEffect(() => {
		const d = dialog.current!;
		d.showModal(); // native focus trap; Escape fires "cancel"
		return () => d.close();
	}, []);

	return (
		<dialog ref={dialog} className="import-dialog" aria-labelledby={titleId} onCancel={onClose}>
			{prompt.kind === 'error' ? (
				<>
					<h2 id={titleId}>Couldn’t import</h2>
					<p>{prompt.message}</p>
					<div className="dialog-actions">
						<button type="button" autoFocus onClick={onClose}>
							OK
						</button>
					</div>
				</>
			) : (
				<>
					<h2 id={titleId}>Import “{prompt.fileName}”?</h2>
					<p>Some content isn’t supported and will change:</p>
					<ul>
						{prompt.parsed.warnings.map((w) => (
							<li key={w}>{unsupportedEffects[w]}</li>
						))}
					</ul>
					<p>The original file is not modified. Import creates a new document.</p>
					<div className="dialog-actions">
						<button type="button" autoFocus onClick={onClose}>
							Cancel
						</button>
						<button type="button" onClick={() => onConfirm(prompt.parsed)}>
							Import anyway
						</button>
					</div>
				</>
			)}
		</dialog>
	);
}
