#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { viewSourceScreenshot, closeBrowser } from './vsource.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    hide: { type: 'string', multiple: true },
    match: { type: 'string', multiple: true },
    line: { type: 'string', multiple: true },
    out: { type: 'string' },
    label: { type: 'string' },
    mode: { type: 'string' },
    context: { type: 'string' },
    width: { type: 'string' },
  },
});

if (!positionals[0]) {
  console.error('Usage: npm run shot -- <url> [--match <text|re:regex>]... [--line <n>]... [--hide <query param>]... [--context <n>] [--mode matches|first] [--width <px>] [--out <file.png>]');
  process.exit(1);
}

try {
  const res = await viewSourceScreenshot({
    url: positionals[0],
    hideParams: values.hide,
    matches: values.match,
    lines: (values.line || []).map(Number),
    out: values.out,
    label: values.label,
    mode: values.mode,
    contextLines: values.context != null ? Number(values.context) : undefined,
    width: values.width != null ? Number(values.width) : undefined,
  });
  console.log(`Saved: ${res.path}`);
  for (const m of res.matches) console.log(`  ${m.line}: ${m.text.slice(0, 160)}`);
} finally {
  await closeBrowser();
}
