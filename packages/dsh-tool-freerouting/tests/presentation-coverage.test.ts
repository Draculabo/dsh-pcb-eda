import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { routingErrorText, routingExplanation } from '../src/presentation/routing-copy.js';

const sourceRoot = join(import.meta.dirname, '..', 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Every code this package can throw, so copy cannot silently collapse to one sentence. */
function thrownCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of sourceFiles(sourceRoot)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/new UpstreamServiceError\(\s*'([A-Z0-9_]+)'/g)) {
      codes.add(match[1]!);
    }
    for (const match of text.matchAll(/new UpstreamServiceError\(\s*[^,']*\?\s*'([A-Z0-9_]+)'\s*:\s*'([A-Z0-9_]+)'/g)) {
      codes.add(match[1]!);
      codes.add(match[2]!);
    }
  }
  return codes;
}

it('explains every error the package can throw instead of one generic sentence', () => {
  const codes = thrownCodes();
  expect(codes.size).toBeGreaterThan(25);
  const generic = routingExplanation('NOT_A_REAL_CODE');
  const unexplained = [...codes].filter((code) => {
    return routingErrorText({ code }) === routingErrorText({ code: 'NOT_A_REAL_CODE' });
  });
  expect(unexplained).toEqual([]);
  // Negative control: the fallback still exists for codes this version cannot know.
  expect(generic.problem).toBe('自动布线未能完成。');
});

it('names an engine-start failure instead of reporting a routing outcome', () => {
  const message = routingErrorText({ code: 'FREEROUTING_UNAVAILABLE' });
  expect(message).toContain('引擎没有启动');
  expect(message).toContain('本次没有把新走线添加到板子');
  expect(message).not.toContain('自动布线未能完成');
});
