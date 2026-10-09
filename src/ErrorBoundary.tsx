import { Component, type ReactNode } from 'react';

type State = { failed: boolean };

// Last-resort fallback. Documents live in IndexedDB, so a reload loses nothing already saved.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
	state: State = { failed: false };

	static getDerivedStateFromError(): State {
		return { failed: true };
	}

	render() {
		if (!this.state.failed) return this.props.children;
		return (
			<div role="alert">
				<p>Something went wrong.</p>
				<button type="button" onClick={() => location.reload()}>
					Reload
				</button>
			</div>
		);
	}
}
