import assert from 'node:assert/strict';
import test from 'node:test';
import { win32 } from 'node:path';
import { isPathInside, stripTerminalControlChars } from '../dist/utils.js';

test('isPathInside rejects Windows paths on different drives', () => {
  assert.equal(
    isPathInside('C:\\workspace', 'D:\\evil\\cli.js', win32),
    false,
  );
});

test('isPathInside accepts Windows paths within the same drive subtree', () => {
  assert.equal(
    isPathInside('C:\\workspace', 'C:\\workspace\\dist\\cli.js', win32),
    true,
  );
});

test('stripTerminalControlChars removes ANSI, OSC, and other control characters', () => {
  const raw = '\u001B[31mwarn\u001B[0m \u001B]52;c;Zm9v\u0007ok\u0008';
  assert.equal(stripTerminalControlChars(raw), 'warn ok');
});
