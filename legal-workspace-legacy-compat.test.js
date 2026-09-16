const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'legal-workspace-ui.js'), 'utf8');

function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0, `${from} must exist`);
  assert.ok(end > start, `${to} must follow ${from}`);
  return source.slice(start, end);
}

test('central workspace does not erase legacy Documents panel', () => {
  const body = section('function renderDocuments()', 'function renderReviews()');
  assert.doesNotMatch(body, /panel\.innerHTML\s*=\s*['"]{2}/);
  assert.match(body, /centralLegalDocuments/);
  assert.doesNotMatch(body, /Nenhum documento gerado ainda/);
});

test('central workspace does not erase legacy Reviews panel', () => {
  const body = section('function renderReviews()', 'async function open');
  assert.doesNotMatch(body, /panel\.innerHTML\s*=\s*['"]{2}/);
  assert.match(body, /centralLegalReviews/);
});

test('central detail stays inside its own mount', () => {
  const body = section('function renderDetail(doc)', 'async function downloadVersion');
  assert.doesNotMatch(body, /target\.innerHTML\s*=\s*['"]{2}/);
  assert.match(body, /centralLegalDetail/);
});

test('only the dedicated central mount is cleared', () => {
  assert.match(source, /function centralMount/);
  assert.match(source, /mount\.innerHTML\s*=\s*['"]{2}/);
});
