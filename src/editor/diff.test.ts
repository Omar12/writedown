import { expect, test } from 'vitest';
import { diffText } from './diff.ts';

const apply = (text: string, hunks: ReturnType<typeof diffText>) =>
	hunks.reduceRight((t, h) => t.slice(0, h.start) + h.insert + t.slice(h.end), text);

test.each([
	['The ideas is good.', 'The idea is good.'],
	['She go home', 'She goes home now'],
	['Remove these extra words please.', 'Remove words.'],
	['', 'from nothing'],
	['to nothing', ''],
	['same', 'same'],
	['日本語 👩‍👩‍👧 café', '日本語 👩‍👩‍👧 cafés!'],
	['line one\nline two', 'line one\nline 2'],
])('hunks turn %j into %j', (a, b) => {
	expect(apply(a, diffText(a, b))).toBe(b);
});

test('only the changed word is touched', () => {
	expect(diffText('The ideas is good.', 'The idea is good.')).toEqual([
		{ start: 4, end: 9, insert: 'idea' },
	]);
	expect(diffText('same', 'same')).toEqual([]);
});
