import { expect, test, type Page } from '@playwright/test';

// NFR-004: a 25,000-word document stays usable while typing and moving the caret.
// Long-task timing exists only in Chromium, the instrumented target browser.
test.skip(({ browserName }) => browserName !== 'chromium', 'Long Tasks API is Chromium-only');

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' });

function fixture(words: number) {
	const sentence = 'The quick brown fox jumps over the **lazy** dog near a [river](https://e.com).';
	const perSentence = sentence.split(' ').length;
	const blocks: string[] = [];
	for (let n = 0, i = 0; n < words; i++) {
		if (i % 20 === 0) blocks.push(`## Section ${i / 20 + 1}`);
		else if (i % 7 === 0) {
			blocks.push(`- ${sentence}\n- ${sentence}`);
			n += perSentence * 2;
		}
		blocks.push(Array(5).fill(sentence).join(' '));
		n += perSentence * 5;
	}
	return blocks.join('\n\n');
}

test('25,000 words: typing and caret moves have no long task over 100 ms', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/');
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Import .md…' }).click();
	const text = fixture(25_000);
	await (
		await chooser
	).setFiles({ name: 'big.md', mimeType: 'text/markdown', buffer: Buffer.from(text) });
	await expect(doc(page).locator('h2')).toHaveCount(text.match(/^## /gm)!.length);
	await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');

	await page.evaluate(() => {
		const w = window as unknown as { longTasks: number[] };
		w.longTasks = [];
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) w.longTasks.push(Math.round(e.duration));
		}).observe({ type: 'longtask' });
	});

	// Middle of the document, then the end; type, move, and let autosave run.
	await doc(page).locator('p').nth(150).click();
	await page.keyboard.type('Typing in the middle of a long document. ', { delay: 30 });
	for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ControlOrMeta+ArrowDown');
	await page.keyboard.type(' And at the very end.', { delay: 30 });
	for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
	await expect(doc(page)).toContainText('Typing in the middle of a long document.');
	await expect(doc(page)).toContainText('And at the very end.');
	await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');

	const longTasks = await page.evaluate(
		() => (window as unknown as { longTasks: number[] }).longTasks,
	);
	console.log(`long tasks (ms): ${JSON.stringify(longTasks)}`);
	expect(Math.max(0, ...longTasks)).toBeLessThanOrEqual(100);
});
