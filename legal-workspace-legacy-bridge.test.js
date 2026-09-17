const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'legal-workspace-legacy-bridge.js');

test('legacy approval is bridged to central approve action', () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /window\.reviewAction\s*=\s*async function/);
  assert.match(source, /status\s*===\s*['"]Aprovado['"]/);
  assert.match(source, /workflow\(['"]approve['"]/);
});

test('legacy review submission is bridged to central workflow', () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /window\.sendForReview\s*=\s*async function/);
  assert.match(source, /workflow\(['"]submit_review['"]/);
});

test('legacy correction is bridged with its comment', () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /workflow\(['"]request_correction['"]/);
  assert.match(source, /comment/);
});

test('legacy document table is decorated with responsible users', () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /Gerado por/);
  assert.match(source, /Revisado por/);
  assert.match(source, /Aprovado por/);
  assert.match(source, /\[data-down\]/);
});

test('already approved local documents are reconciled after deployment', () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /async function reconcileLegacyState/);
  assert.match(source, /legacy\.status\s*===\s*['"]Aprovado['"]/);
  assert.match(source, /central\.status\s*!==\s*['"]approved['"]/);
});
