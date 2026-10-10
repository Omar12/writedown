import type { SaveState } from './autosave.ts';

type Props = {
	state: SaveState;
	onRetry: () => void;
	onKeepMine: () => void;
	onLoadLatest: () => void;
};

const label: Record<'clean' | 'dirty' | 'saving', string> = {
	clean: 'Saved',
	dirty: 'Unsaved changes',
	saving: 'Saving…',
};

export function SaveStatus({ state, onRetry, onKeepMine, onLoadLatest }: Props) {
	if (state === 'error') {
		return (
			<div className="save-status save-problem" role="alert">
				Couldn’t save. Your text is still here.
				<button type="button" onClick={onRetry}>
					Retry
				</button>
			</div>
		);
	}
	if (state === 'conflict') {
		return (
			<div className="save-status save-problem" role="alert">
				This document was changed in another tab.
				<button type="button" onClick={onLoadLatest}>
					Load latest
				</button>
				<button type="button" onClick={onKeepMine}>
					Keep mine
				</button>
			</div>
		);
	}
	return (
		<div className="save-status" role="status">
			{label[state]}
		</div>
	);
}
