#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { viewSourceScreenshot, findInSource, closeBrowser } from './vsource.js';

const server = new McpServer({ name: 'playwright-vsource', version: '0.1.0' });

const common = {
  url: z.string().url().describe('Page URL to read the raw HTML source of.'),
  hide_params: z
    .array(z.string())
    .optional()
    .describe('Query parameter names to keep out of the view-source header (they are still sent with the request), e.g. preview or auth tokens.'),
  match: z
    .array(z.string())
    .optional()
    .describe('Text to highlight. Plain text also matches its JSON-escaped form (/ as \\/). Prefix with "re:" for a regex.'),
  lines: z.array(z.number().int().positive()).optional().describe('Line numbers to highlight in full.'),
};

server.registerTool(
  'view_source_screenshot',
  {
    title: 'View-source screenshot',
    description:
      "Fetch a page's raw HTML the way a browser does, render it like Chrome's view-source (line numbers, monospace), highlight matches and save a PNG. Returns the file path and the matched lines.",
    inputSchema: {
      ...common,
      out: z.string().optional().describe('Output PNG path. Defaults to ~/Desktop/vsource-<host-path>-<time>.png.'),
      label: z.string().optional().describe('Suffix for the default filename, e.g. "before" or "after".'),
      mode: z
        .enum(['matches', 'first'])
        .optional()
        .describe('"matches" (default) shows only the highlighted lines plus context, with long gaps collapsed; "first" is one viewport of the full source scrolled to the first match.'),
      context_lines: z.number().int().min(0).max(50).optional().describe('Lines of context above and below the matches (default 4).'),
      width: z.number().int().min(600).max(3000).optional().describe('Viewport width in px (default 1366).'),
    },
  },
  async (args) => {
    const res = await viewSourceScreenshot({
      url: args.url,
      hideParams: args.hide_params,
      matches: args.match,
      lines: args.lines,
      out: args.out,
      label: args.label,
      mode: args.mode,
      contextLines: args.context_lines,
      width: args.width,
    });
    const summary = [
      `Saved: ${res.path}`,
      `Source: view-source:${res.shownUrl} (HTTP ${res.status}, ${res.totalLines} lines)`,
      res.matches.length
        ? `Highlighted ${res.matches.length} line(s):\n` + res.matches.map((m) => `  ${m.line}: ${m.text}`).join('\n')
        : 'No matches found; screenshot shows the top of the source.',
    ].join('\n');
    return { content: [{ type: 'text', text: summary }], structuredContent: res };
  },
);

server.registerTool(
  'view_source_find',
  {
    title: 'Find in view-source',
    description: "Fetch a page's raw HTML the way a browser does and return the line numbers and text of matches, without taking a screenshot.",
    inputSchema: common,
  },
  async (args) => {
    const res = await findInSource({
      url: args.url,
      hideParams: args.hide_params,
      matches: args.match,
      lines: args.lines,
    });
    const text = res.matches.length
      ? `view-source:${res.shownUrl} (HTTP ${res.status}, ${res.totalLines} lines)\n` +
        res.matches.map((m) => `${m.line}: ${m.text}`).join('\n')
      : `view-source:${res.shownUrl} (HTTP ${res.status}): no matches`;
    return { content: [{ type: 'text', text }], structuredContent: res };
  },
);

const shutdown = async () => {
  await closeBrowser();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.connect(new StdioServerTransport());
