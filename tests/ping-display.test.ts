import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { NetworkPing } from '../src/shared/ui/OnlineStatus';

it('renders whole milliseconds in the visible ping and its accessible label', () => {
	const html = renderToStaticMarkup(createElement(NetworkPing, { ping: 1.333333333333 }));
	expect(html).toContain('aria-label="Пинг: 1"');
	expect(html).toContain('>1</span>');
	expect(html).not.toContain('1.333');
	expect(renderToStaticMarkup(createElement(NetworkPing, { ping: 92.8 }))).toContain('>93</span>');
	expect(renderToStaticMarkup(createElement(NetworkPing))).toContain('>…</span>');
});

import { createElement } from 'react';
