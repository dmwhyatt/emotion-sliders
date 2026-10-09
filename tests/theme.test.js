// Keeps the app in step with the vendored CMS web theme (css/vendor/, js/vendor/): when the theme is updated, a renamed or removed
// token or class shows up here rather than as a silently unstyled page.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const theme = read('css/vendor/cambridge-tokens.css');
const appCss = read('css/style.css');
const html = read('index.html');
const appJs = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => read(`js/${f}`)).join('\n');
const unique = (a) => [...new Set(a)];

const definedTokens = new Set([...theme.matchAll(/(--cam-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const definedClasses = new Set([...theme.matchAll(/\.(cam-[a-z0-9-]+)/g)].map((m) => m[1]));

test('every --cam-* token the app uses is defined by the theme', () => {
  for (const [name, text] of [['css/style.css', appCss], ['index.html', html], ['js/*.js', appJs]]) {
    for (const t of unique([...text.matchAll(/var\(\s*(--cam-[a-z0-9-]+)/g)].map((m) => m[1]))) {
      assert.ok(definedTokens.has(t), `${name} uses ${t}, which the theme does not define`);
    }
  }
});

test('every .cam-* class the app uses is defined by the theme', () => {
  const used = [
    ...[...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)),
    ...[...appJs.matchAll(/['"`]([^'"`]*\bcam-[a-z0-9-]+[^'"`]*)['"`]/g)].flatMap((m) => m[1].split(/\s+/)),
  ].filter((c) => c.startsWith('cam-'));
  assert.ok(used.length > 15, 'expected the app to use the theme\'s classes');
  for (const c of unique(used)) assert.ok(definedClasses.has(c), `.${c} is not in the theme`);
});

test('the app does not use the theme\'s deprecated teal names', () => {
  for (const [name, text] of [['css/style.css', appCss], ['index.html', html], ['js/*.js', appJs]]) {
    assert.ok(!/--cam-teal/.test(text), `${name} still uses a deprecated --cam-teal token`);
  }
});

test('dark mode: every emotion colour is overridden under both of the theme\'s dark selectors', () => {
  const dark = appCss.match(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}\n:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
  assert.ok(dark, 'expected the media-query block followed by the data-theme="dark" block');
  for (const emotion of ['happy', 'scary', 'peaceful', 'sad']) {
    for (const prop of [`--emo-${emotion}`, `--emo-${emotion}-ink`]) {
      assert.ok(appCss.includes(`${prop}:`), `${prop} is not defined`);
      assert.ok(dark[1].includes(`${prop}:`), `${prop} has no dark value for the OS setting`);
      assert.ok(dark[2].includes(`${prop}:`), `${prop} has no dark value for data-theme="dark"`);
    }
  }
});

test('the theme toggle is wired as the theme documents: script in <head> (not deferred), button in the header', () => {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
  assert.match(head, /<script src="js\/vendor\/cambridge-theme\.js"><\/script>/);
  assert.ok(!/<script[^>]*cambridge-theme[^>]*(defer|async)/.test(head));
  assert.match(html, /<header class="cam-header">[\s\S]*data-cam-theme-toggle[\s\S]*<\/header>/);
});
