// Word-level diff. Tokens are runs of whitespace, runs of word characters, or single
// other characters, so every input character belongs to exactly one token.
const TOKEN = /\s+|[\p{L}\p{N}\p{M}_'’]+|[^\s]/gu;

/** Replace original[start, end) with `insert`. Offsets are UTF-16 indexes into the original. */
export type Hunk = { start: number; end: number; insert: string };

// ponytail: O(n*m) LCS table; fine for sentence/paragraph targets, swap for Myers if targets grow large.
export function diffText(original: string, proposed: string): Hunk[] {
	const a = original.match(TOKEN) ?? [];
	const b = proposed.match(TOKEN) ?? [];
	const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

	const hunks: Hunk[] = [];
	let hunk: Hunk | null = null;
	let i = 0;
	let j = 0;
	let offset = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			hunk = null;
			offset += a[i++].length;
			j++;
			continue;
		}
		if (!hunk) hunks.push((hunk = { start: offset, end: offset, insert: '' }));
		if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) hunk.insert += b[j++];
		else hunk.end = offset += a[i++].length;
	}
	return hunks;
}
