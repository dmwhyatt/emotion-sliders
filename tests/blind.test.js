// In the experiment's blind mode there are no numbers and no bold starting-position mark, so the help line must not talk about one.
// The sentence about the bold marks (.bold-note, built in js/app.js) is therefore hidden by the same selector that hides the
// numbers and neutralises the mark.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('css/style.css');
const appJs = read('js/app.js');
const blind = "#app[data-phase='trial'][data-blind='true']";

test('blind mode hides the tick labels, flattens the bold mark and hides the help sentence about it', () => {
  assert.ok(css.includes(`${blind} .tick span`), 'tick labels are not hidden');
  assert.match(css, new RegExp(`${blind.replace(/[[\]]/g, '\\$&')} \\.tick\\.nominal::before \\{[^}]*1px`), 'the bold mark is not flattened');
  assert.match(css, new RegExp(`${blind.replace(/[[\]]/g, '\\$&')} \\.bold-note \\{ display: none; \\}`), 'the help sentence is not hidden');
});

test('the help line mentions the bold mark only inside .bold-note', () => {
  assert.match(appJs, /className = 'bold-note'/);
  const withoutNote = appJs.replace(/'The bold mark on each scale is its starting position\.'/, '');
  assert.ok(!/bold mark/i.test(withoutNote.replace(/\/\/.*$/gm, '')), 'a help text mentions the bold mark outside the .bold-note sentence');
});
