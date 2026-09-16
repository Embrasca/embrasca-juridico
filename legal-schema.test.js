const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/20260916_legal_documents_audit.sql'), 'utf8');

test('creates central legal document tables and private storage bucket', () => {
  assert.match(sql, /create table if not exists public\.legal_documents/i);
  assert.match(sql, /create table if not exists public\.legal_document_versions/i);
  assert.match(sql, /create table if not exists public\.legal_reviews/i);
  assert.match(sql, /legal-documents/);
  assert.match(sql, /public\.legal_document_versions[\s\S]*generated_by uuid not null/i);
  assert.match(sql, /public\.legal_reviews[\s\S]*reviewed_by uuid not null/i);
});

test('responsible users are derived from auth uid and direct writes are blocked', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /revoke insert, update, delete on public\.legal_documents from authenticated/i);
  assert.match(sql, /revoke insert, update, delete on public\.legal_document_versions from authenticated/i);
  assert.match(sql, /revoke insert, update, delete on public\.legal_reviews from authenticated/i);
  assert.doesNotMatch(sql, /approved_by\s+text/i);
});

test('only legal staff can write review actions', () => {
  assert.match(sql, /legal_request_correction/);
  assert.match(sql, /legal_approve_document/);
  assert.match(sql, /legal_current_role\(\)\s+(?:not\s+)?in\s*\('admin',\s*'juridico'\)/i);
});

test('new versions reset review approval state by version isolation', () => {
  assert.match(sql, /unique\s*\(document_id,\s*version\)/i);
  assert.match(sql, /current_version/);
  assert.match(sql, /correction_requested/);
  assert.match(sql, /approved/);
});
