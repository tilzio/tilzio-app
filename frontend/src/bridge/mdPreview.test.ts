// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './mdPreview';

describe('renderMarkdown — render', () => {
  it('renders headings, lists, code and links', () => {
    const html = renderMarkdown('# Title\n\n- a\n- b\n\n`code` and [link](https://x.io)');
    expect(html).toContain('<h1');
    expect(html).toContain('Title');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('href="https://x.io"');
  });

  it('supports GFM tables', () => {
    const html = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders bold/italic emphasis', () => {
    const html = renderMarkdown('**bold** and *em*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>em</em>');
  });
});

describe('renderMarkdown — sanitizing (a11y/security invariant)', () => {
  it('strips <script> tags', () => {
    const html = renderMarkdown('ok\n\n<script>window.x=1<\/script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('ok');
  });

  it('strips inline event handlers (onerror)', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('strips javascript: URLs from links', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('strips <iframe>', () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('preserves benign inline HTML (profile does not over-strip)', () => {
    const html = renderMarkdown('text <strong>bold</strong> more');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('returns a string for empty input', () => {
    expect(typeof renderMarkdown('')).toBe('string');
  });
});
