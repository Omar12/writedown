// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { parseMarkdown } from './markdown.ts';

// In a browser, @tiptap/markdown parses recognized HTML through the editor schema via
// DOMParser. Nothing outside the schema (script, img, event handlers) may survive.
test('browser HTML parsing keeps only schema content', () => {
	const md =
		'<script>window.pwned = true</script>\n\n<p onclick="alert(1)">hi <b>x</b></p>\n\n<img src=x onerror="window.pwned = true">';
	const { doc, warnings } = parseMarkdown(md);
	const json = JSON.stringify(doc);
	expect(warnings).toEqual(['html']);
	expect(json).not.toMatch(/onclick|onerror|"image"|"script"/);
	expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
});
