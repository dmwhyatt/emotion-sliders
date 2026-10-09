// The README promises that nothing leaves the laptop, and the theme's own examples load fonts from Google; this keeps the page from
// quietly picking up a request to another site (a CDN stylesheet, a web font, a script, an @import or a url()).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const external = /(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i;      // an attribute pointing at another origin

test('index.html loads only local files (links in the footer are plain <a href>)', () => {
  const html = read('index.html');
  for (const tag of html.match(/<(?:link|script|img|source|iframe)\b[^>]*>/gi) || []) {
    assert.ok(!external.test(tag), `external resource: ${tag}`);
  }
});

test('stylesheets and scripts make no requests to other origins', () => {
  const files = ['css/style.css', 'css/fonts.css', 'css/vendor/cambridge-tokens.css',
    ...readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
  for (const f of files) {
    const text = read(f);
    for (const m of text.matchAll(/url\(\s*["']?([^)"']+)/gi)) {
      if (m[1].startsWith('data:')) continue;
      assert.ok(!/^(?:https?:)?\/\//i.test(m[1]), `${f}: url(${m[1]})`);
    }
    assert.ok(!/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i.test(text), `${f}: @import of another origin`);
    for (const m of text.matchAll(/\bfetch\(\s*(['"`])(https?:\/\/[^'"`]+)\1/g)) assert.fail(`${f}: fetch of ${m[2]}`);
  }
});

test('every font file the stylesheet names is shipped', () => {
  const css = read('css/fonts.css');
  const files = [...css.matchAll(/url\("\.\.\/(fonts\/[^"]+)"\)/g)].map((m) => m[1]);
  assert.equal(files.length, 4);
  for (const f of files) assert.ok(readFileSync(new URL(`../${f}`, import.meta.url)).length > 10000, f);
});
