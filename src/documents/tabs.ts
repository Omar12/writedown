// Cross-tab coordination for documents open in more than one tab. BroadcastChannel never
// delivers to the sender, so no tab id is needed.
export type TabMessage =
	| { type: 'claim'; docId: string } // this tab is now editing docId
	| { type: 'released'; docId: string; updatedAt: string } // flushed after being claimed away
	| { type: 'deleted'; docId: string };

export function openTabChannel(onMessage: (message: TabMessage) => void) {
	if (typeof BroadcastChannel === 'undefined') return { post: () => {}, close: () => {} };
	const channel = new BroadcastChannel('writedown-documents');
	channel.onmessage = (event: MessageEvent<TabMessage>) => onMessage(event.data);
	return {
		post: (message: TabMessage) => channel.postMessage(message),
		close: () => channel.close(),
	};
}
