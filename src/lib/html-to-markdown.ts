/**
 * Minimal HTML → Markdown converter (no dependency).
 *
 * Most job-board descriptions arrive as small HTML fragments —  `<p>`, `<ul>`,
 * `<strong>`, `<a>` — not full documents. A naive `strip-all-tags` loses the
 * structure that lets the UI render headings + bullet lists. This converter
 * preserves enough markup that `react-markdown` produces a readable post.
 *
 * Not a parser — regex passes in a careful order. Don't feed it untrusted HTML
 * and trust the output for an HTML sink; it's intended for plain-text +
 * markdown rendering only.
 */
export function htmlToMarkdown(html: string): string {
    if (!html) return "";
    let s = html;

    // Normalize self-closing line breaks first so they survive later passes.
    s = s.replace(/<br\s*\/?\s*>/gi, "\n");
    s = s.replace(/<hr\s*\/?\s*>/gi, "\n\n---\n\n");

    // Headings → markdown #'s
    s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t) => `\n\n# ${stripInline(t)}\n\n`);
    s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `\n\n## ${stripInline(t)}\n\n`);
    s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `\n\n### ${stripInline(t)}\n\n`);
    s = s.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_m, t) => `\n\n#### ${stripInline(t)}\n\n`);

    // Inline emphasis / code BEFORE we touch block elements so the inner text is intact.
    s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
    s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
    s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

    // Links: <a href="X">Y</a> → [Y](X)
    s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
        const clean = stripInline(text).trim();
        if (!clean) return href;
        return `[${clean}](${href})`;
    });

    // List items → "- ..."
    s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => `- ${stripInline(t).trim()}\n`);
    s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");

    // Paragraphs and divs → blank line separators
    s = s.replace(/<\/(p|div|section|article)>/gi, "\n\n");
    s = s.replace(/<(p|div|section|article)[^>]*>/gi, "");

    // Strip anything still left
    s = s.replace(/<[^>]+>/g, "");

    // HTML entities (cover the common ones).
    s = s
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&rsquo;|&lsquo;/g, "'")
        .replace(/&rdquo;|&ldquo;/g, '"')
        .replace(/&hellip;/g, "…")
        .replace(/&mdash;/g, "—")
        .replace(/&ndash;/g, "–")
        .replace(/&bull;/g, "•")
        // Numeric entities (decimal + hex)
        .replace(/&#x([0-9a-f]+);/gi, (_m, c: string) => String.fromCodePoint(parseInt(c, 16)))
        .replace(/&#(\d+);/g, (_m, c: string) => String.fromCodePoint(parseInt(c, 10)));

    // Collapse runs of whitespace introduced by tag removal.
    s = s
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return s.slice(0, 10_000);
}

/** Strip tags out of inline text — used inside link / heading / list content. */
function stripInline(s: string): string {
    return s.replace(/<[^>]+>/g, "");
}
