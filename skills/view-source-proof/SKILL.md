---
name: view-source-proof
description: Take proof screenshots of a web page's raw HTML source (like Chrome's view-source) with the relevant tags highlighted, using the playwright-vsource MCP server. Use when the user asks for a screenshot or proof of what is in a page's source - meta tags, hreflang, canonical, JSON-LD, robots meta, scripts - or wants to check a change in the HTML before or after deploy.
---

# View-source proof screenshots

Use the `playwright-vsource` MCP tools. Don't hand-write browser JavaScript to rebuild view-source.

## Tools

- `view_source_find` - returns the matching line numbers and text. Use it first to check the match hits the right lines.
- `view_source_screenshot` - saves a PNG (default `~/Desktop/vsource-<host-path>-<time>.png`) and returns the path and matched lines.

## Steps

1. Pick the narrowest `match` that identifies the proof: the exact tag or attribute, not a word that also appears in links or body copy.
   - Good: `hreflang="en"`, `<meta name="description"`, `"url": "https://example.com/contact"`, `rel="canonical"`.
   - Plain text also matches its JSON-escaped form, so `https://example.com/a` finds `https:\/\/example.com\/a` inside JSON-LD.
   - Prefix with `re:` for a regex, e.g. `re:<meta (name="description"|property="og:(title|description)")[^>]*>`.
2. Run `view_source_find` and confirm every returned line is one you meant. Tighten the match if not.
3. Run `view_source_screenshot` with the same match.
   - Put preview tokens, auth keys, tracking params and similar in `hide_params` so they're sent but not shown in the header.
   - Default `mode: "matches"` shows only the matched lines with context and collapses long gaps. Use `mode: "first"` for one viewport of the uncollapsed source.
   - For before/after, run it twice with `label: "before"` / `label: "after"`.
4. Open the PNG (Read it) before reporting, to check the highlight landed on the right tag.
5. Tell the user the file path, the page URL and the highlighted line numbers.

## Notes

- The image is a rendering of the source, not a capture of Chrome's own view-source window. The content and line numbers are what the server returned to a real browser.
- A CDN or bot protection may serve a browser something different from what curl or a search crawler gets. If the source looks unexpected (a challenge page, a different robots.txt), say so.
- HTML encodes `&` in attributes as `&amp;`. One `&amp;` in the source is correct; `&amp;amp;` is double encoding.
