import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Markdown → sanitized HTML. `marked` (gfm) renders, DOMPurify cleans: the
// html profile = strict allowlist (no <script>/<iframe>/svg/mathml; event handlers and
// javascript: URLs are stripped). The ONLY source of raw HTML for {@html} in the editor
// (design §5.1/§7, a11y/security invariant). `async: false` forces a synchronous
// return (string) and guards against a silent bug if someone enables an async marked extension.
export function renderMarkdown(src: string): string {
  const raw = marked.parse(src, { gfm: true, breaks: false, async: false });
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}
