# Responsáveis e Auditoria de Documentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar documentos, versões e revisões no Supabase e registrar automaticamente `Gerado por`, `Revisado por` e `Aprovado por` a partir da conta autenticada, exibindo esses responsáveis na lista de Documentos e nos detalhes/revisão sem alterar o conteúdo jurídico do DOCX.

**Architecture:** O Supabase será a fonte de verdade para documentos, versões e eventos jurídicos. Escritas sensíveis serão feitas por RPCs que derivam o ator de `auth.uid()`; o navegador nunca enviará IDs de responsáveis como autoridade. Uma API Vercel autenticada (`/api/legal-workspace`) orquestrará geração do DOCX, upload no bucket privado, criação de versões e ações de revisão; um módulo de UI isolado adaptará as telas legadas sem reescrever `app.html`.

**Tech Stack:** Node.js CommonJS, `node:test`, Vercel serverless functions, Supabase Auth/Postgres/Storage/RLS/RPC, JavaScript browser sem framework, DOCX engine existente (`lib/docx-engine.js`, `lib/docx-cleanup.js`, `lib/legal-service-layout.js`).

**Spec:** `docs/superpowers/specs/2026-09-16-responsaveis-auditoria-documentos-design.md`

## Global Constraints

- Os responsáveis vêm exclusivamente da conta autenticada; não existe seleção manual.
- `Gerado por` é o usuário que gerou a versão atual; versões anteriores preservam seus responsáveis.
- `Revisado por` é o último `juridico`/`admin` que realizou ação jurídica na versão atual; aprovação direta também conta como revisão.
- `Aprovado por` só existe após aprovação da versão atual e é o usuário autenticado que aprovou.
- Nova versão não herda revisão/aprovação da versão anterior.
- Responsáveis aparecem na lista de Documentos e em detalhes/revisão, nunca dentro do DOCX.
- Apenas `juridico` e `admin` podem solicitar correção ou aprovar.
- Usuário comum enxerga apenas os próprios documentos; `juridico`/`admin` enxergam todos.
- Nenhuma chave `service_role` é exposta no navegador.
- O contrato `MINUTA_PRESTACAO_SERVICOS` deve manter o rodapé jurídico de vistos e permanecer sem o template verde.
- Trabalhar na branch existente `main`; não criar branch auxiliar para esta implementação.

---

### Task 1: Criar o modelo de dados, RLS, RPCs e bucket privado

**Files:**
- Create: `supabase/migrations/20260916_legal_documents_audit.sql`
- Create: `legal-schema.test.js`

**Interfaces:**
- Consumes: `public.profiles(id, name, role, active)` já existente.
- Produces: tabelas `legal_documents`, `legal_document_versions`, `legal_reviews`; bucket `legal-documents`; RPCs `legal_list_documents()`, `legal_get_document(uuid)`, `legal_create_document(...)`, `legal_add_version(...)`, `legal_submit_review(uuid)`, `legal_request_correction(uuid,text)`, `legal_approve_document(uuid)`, `legal_get_download_path(uuid,int)`.

- [ ] **Step 1: Escrever os testes estruturais falhando**

Criar `legal-schema.test.js` lendo a migration e exigindo, no mínimo:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, 'supabase/migrations/20260916_legal_documents_audit.sql'),
  'utf8',
);

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
  assert.match(sql, /role\s+in\s*\('admin',\s*'juridico'\)/i);
});

test('new versions reset review approval state by version isolation', () => {
  assert.match(sql, /unique\s*\(document_id,\s*version\)/i);
  assert.match(sql, /current_version/);
  assert.match(sql, /correction_requested/);
  assert.match(sql, /approved/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run:

```bash
node --test legal-schema.test.js
```

Expected: FAIL porque `20260916_legal_documents_audit.sql` ainda não existe.

- [ ] **Step 3: Criar a migration com tabelas e constraints**

Implementar os três registros centrais:

```sql
create table if not exists public.legal_documents (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id),
  template_code text not null,
  title text,
  counterparty text,
  status text not null default 'draft'
    check (status in ('draft','under_review','correction_requested','approved')),
  current_version integer not null default 1 check (current_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  version integer not null check (version >= 1),
  generated_by uuid not null references public.profiles(id),
  generated_at timestamptz not null default now(),
  form_data jsonb not null default '{}'::jsonb,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.legal_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  version integer not null check (version >= 1),
  action text not null check (action in ('correction_requested','approved')),
  reviewed_by uuid not null references public.profiles(id),
  comment text,
  created_at timestamptz not null default now()
);
```

Adicionar trigger `updated_at` reutilizando `public.set_updated_at()` já existente.

- [ ] **Step 4: Implementar helpers e políticas de leitura**

Criar função segura para papel atual:

```sql
create or replace function public.legal_current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.active = true
$$;
```

Habilitar RLS nas três tabelas. Políticas de `select`:

```sql
using (
  owner_id = auth.uid()
  or public.legal_current_role() in ('admin','juridico')
)
```

Para versões e revisões, usar `exists` contra `public.legal_documents` com a mesma regra. Revogar `insert/update/delete` direto de `authenticated`; as mutações devem passar pelos RPCs.

- [ ] **Step 5: Implementar RPCs de escrita derivando o ator da sessão**

`legal_create_document` recebe um UUID gerado pelo servidor, metadados, `form_data` e `storage_path`, mas nunca recebe `generated_by`:

```sql
create or replace function public.legal_create_document(
  p_document_id uuid,
  p_template_code text,
  p_title text,
  p_counterparty text,
  p_form_data jsonb,
  p_storage_path text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.profiles where id = v_uid and active = true
  ) then raise exception 'UNAUTHORIZED'; end if;

  insert into public.legal_documents(id, owner_id, template_code, title, counterparty, status, current_version)
  values (p_document_id, v_uid, p_template_code, p_title, p_counterparty, 'draft', 1);

  insert into public.legal_document_versions(document_id, version, generated_by, form_data, storage_path)
  values (p_document_id, 1, v_uid, coalesce(p_form_data, '{}'::jsonb), p_storage_path);

  return p_document_id;
end;
$$;
```

`legal_add_version` deve validar proprietário ou staff, validar `p_expected_current_version`, inserir `current_version + 1` com `generated_by = auth.uid()`, atualizar `current_version` e status para `draft`, e retornar a nova versão. A comparação com `p_expected_current_version` evita duas versões concorrentes com o mesmo número.

`legal_submit_review` deve aceitar proprietário ou staff e atualizar a versão atual para `under_review`.

`legal_request_correction` e `legal_approve_document` devem exigir:

```sql
if public.legal_current_role() not in ('admin','juridico') then
  raise exception 'FORBIDDEN';
end if;
```

Em seguida inserir `legal_reviews.reviewed_by = auth.uid()` e usar `current_version` do documento. `legal_request_correction` atualiza status para `correction_requested`; `legal_approve_document` atualiza para `approved`.

- [ ] **Step 6: Implementar RPCs de leitura com nomes dos responsáveis**

`legal_list_documents()` deve retornar JSON com os responsáveis da versão atual:

```json
{
  "id": "uuid",
  "templateCode": "MINUTA_PRESTACAO_SERVICOS",
  "title": "...",
  "counterparty": "...",
  "status": "under_review",
  "currentVersion": 2,
  "generatedBy": { "id": "uuid", "name": "Nome" },
  "reviewedBy": { "id": "uuid", "name": "Nome" },
  "approvedBy": null
}
```

Derivação SQL:
- `generatedBy`: versão cujo `version = current_version`;
- `reviewedBy`: última linha de `legal_reviews` daquela versão, ordenada por `created_at desc, id desc`;
- `approvedBy`: última linha com `action='approved'` da versão atual.

`legal_get_document(p_document_id)` deve retornar o mesmo resumo mais arrays `versions` e `reviews`, cada evento com nome e data/hora. A função deve retornar `null`/erro se o usuário não tiver acesso.

`legal_get_download_path(p_document_id,p_version)` deve retornar apenas `storage_path`, `template_code`, `title` e `version` se o usuário estiver autorizado.

- [ ] **Step 7: Criar o bucket privado e políticas de Storage**

```sql
insert into storage.buckets (id, name, public)
values ('legal-documents', 'legal-documents', false)
on conflict (id) do update set public = false;
```

Políticas de `storage.objects` devem limitar `bucket_id = 'legal-documents'`. Permitir leitura quando o primeiro segmento do caminho for `auth.uid()::text` ou o papel atual for `admin/juridico`; permitir escrita quando o primeiro segmento for o próprio usuário ou quando for staff. O formato obrigatório do caminho será:

```text
owner_id/document_id/vN/documento.docx
```

- [ ] **Step 8: Rodar testes e aplicar a migration no Supabase conectado**

Run:

```bash
node --test legal-schema.test.js
```

Expected: PASS.

Depois executar o conteúdo de `supabase/migrations/20260916_legal_documents_audit.sql` no projeto Supabase conectado e consultar `legal_documents`, `legal_document_versions`, `legal_reviews` e `storage.buckets` para confirmar criação.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260916_legal_documents_audit.sql legal-schema.test.js
git commit -m "feat: add central legal document audit schema"
```

---

### Task 2: Extrair um serviço único de geração DOCX reutilizável

**Files:**
- Create: `lib/legal-docx-service.js`
- Create: `legal-docx-service.test.js`
- Modify: `api/generate-docx.js`

**Interfaces:**
- Consumes: `generateDocx`, `cleanGeneratedDocx`, `applyLegalServiceContractLayoutToBuffer`.
- Produces: `buildLegalDocx({ template, replacements, templateCode }) -> Buffer`.

- [ ] **Step 1: Escrever teste falhando do serviço**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildZip, readZip } = require('./lib/docx-engine');
const { buildLegalDocx } = require('./lib/legal-docx-service');

function minimalTemplate() {
  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
    { name: 'word/document.xml', data: Buffer.from('<w:document><w:body><w:p><w:r><w:t>{{name}}</w:t></w:r></w:p></w:body></w:document>') },
  ]);
}

test('buildLegalDocx returns a valid docx and replaces values', () => {
  const output = buildLegalDocx({
    template: minimalTemplate(),
    replacements: { name: 'Cliente Teste' },
    templateCode: 'NDA_BR',
  });
  assert.equal(output.readUInt32LE(0), 0x04034b50);
  const combined = readZip(output).map(e => e.data.toString('utf8')).join('\n');
  assert.match(combined, /Cliente Teste/);
});
```

Adicionar teste específico garantindo que `MINUTA_PRESTACAO_SERVICOS` continua passando pelo layout jurídico de vistos e que o template verde não reaparece.

- [ ] **Step 2: Rodar e confirmar RED**

```bash
node --test legal-docx-service.test.js
```

Expected: FAIL porque `lib/legal-docx-service.js` não existe.

- [ ] **Step 3: Implementar o serviço**

```js
const { generateDocx } = require('./docx-engine');
const { cleanGeneratedDocx } = require('./docx-cleanup');
const { applyLegalServiceContractLayoutToBuffer } = require('./legal-service-layout');

function buildLegalDocx({ template, replacements, templateCode }) {
  const generated = generateDocx(template, replacements, { templateCode });
  let buffer = cleanGeneratedDocx(generated.buffer, { templateCode });
  if (templateCode === 'MINUTA_PRESTACAO_SERVICOS') {
    buffer = applyLegalServiceContractLayoutToBuffer(buffer);
  }
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error('DOCX gerado acima do limite permitido.');
  }
  return buffer;
}

module.exports = { buildLegalDocx };
```

- [ ] **Step 4: Alterar `/api/generate-docx` para usar o serviço sem mudar sua API pública**

Substituir a sequência `generateDocx -> cleanGeneratedDocx -> layout` por:

```js
const { buildLegalDocx } = require('../lib/legal-docx-service');
// ...
const cleanBuffer = buildLegalDocx({ template, replacements, templateCode });
```

Manter autenticação, validações e headers atuais.

- [ ] **Step 5: Rodar testes do DOCX e regressão existente**

```bash
node --test legal-docx-service.test.js legal-service-layout.test.js docx-engine.test.js docx-formatting.test.js docx-highlight-cleanup.test.js central-auth.test.js
```

Expected: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/legal-docx-service.js legal-docx-service.test.js api/generate-docx.js
git commit -m "refactor: share legal docx generation service"
```

---

### Task 3: Adicionar transporte binário autenticado para Supabase Storage

**Files:**
- Modify: `api/_supabase.js`
- Create: `supabase-storage.test.js`

**Interfaces:**
- Produces: `supabaseRawFetch(path, { token, method, body, headers }) -> { ok, status, response }`.

- [ ] **Step 1: Escrever teste falhando**

O teste deve carregar `_supabase.js` com `global.fetch` falso e provar que o helper envia `apikey`, `Authorization: Bearer <token>` e não serializa `Buffer` como JSON:

```js
test('supabaseRawFetch preserves binary body and auth headers', async () => {
  const body = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  let received;
  global.fetch = async (url, options) => {
    received = { url, options };
    return { ok: true, status: 200 };
  };
  const { supabaseRawFetch } = require('./api/_supabase');
  await supabaseRawFetch('/storage/v1/object/legal-documents/x.docx', {
    token: 'jwt', method: 'POST', body,
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  });
  assert.equal(received.options.body, body);
  assert.equal(received.options.headers.Authorization, 'Bearer jwt');
});
```

- [ ] **Step 2: Rodar e confirmar RED**

```bash
node --test supabase-storage.test.js
```

Expected: FAIL porque `supabaseRawFetch` ainda não existe.

- [ ] **Step 3: Implementar o helper**

Adicionar a `api/_supabase.js`:

```js
async function supabaseRawFetch(path, { token, method = 'GET', body, headers = {} } = {}) {
  const c = config();
  if (!c.configured) throw new Error('AUTH_NOT_CONFIGURED');
  const requestHeaders = { apikey: c.anon, ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  const response = await fetch(`${c.url}${path}`, {
    method,
    headers: requestHeaders,
    body,
  });
  return { ok: response.ok, status: response.status, response };
}
```

Exportar `supabaseRawFetch` sem mudar `supabaseFetch`.

- [ ] **Step 4: Rodar teste e regressão de autenticação**

```bash
node --test supabase-storage.test.js central-auth.test.js api-supabase-profile.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_supabase.js supabase-storage.test.js
git commit -m "feat: add authenticated Supabase storage transport"
```

---

### Task 4: Implementar a API central de documentos, versões e revisões

**Files:**
- Create: `api/legal-workspace-core.js`
- Create: `api/legal-workspace.js`
- Create: `legal-workspace-api.test.js`

**Interfaces:**
- Consumes: `requireUser`, `supabaseFetch`, `supabaseRawFetch`, `buildLegalDocx`.
- Produces: `GET /api/legal-workspace`, `POST /api/legal-workspace`.
- POST actions: `create_document`, `create_version`, `submit_review`, `request_correction`, `approve`.

- [ ] **Step 1: Escrever testes falhando do core**

`api/legal-workspace-core.js` deve expor funções puras:

```js
const ALLOWED_TEMPLATE_CODES = new Set([
  'MINUTA_AD_EXITUM','MINUTA_PRESTACAO_SERVICOS','MOU_BR','NDA_BR','NDA_EN','NDA_US_FRANCO'
]);

function storagePath(ownerId, documentId, version) {
  return `${ownerId}/${documentId}/v${version}/documento.docx`;
}

function isLegalStaff(user) {
  return Boolean(user && ['admin','juridico'].includes(user.role));
}
```

Testar também que payloads não aceitam `generatedBy`, `reviewedBy` ou `approvedBy` como parte dos argumentos enviados aos RPCs.

- [ ] **Step 2: Rodar e confirmar RED**

```bash
node --test legal-workspace-api.test.js
```

Expected: FAIL porque os módulos ainda não existem.

- [ ] **Step 3: Implementar `legal-workspace-core.js`**

Adicionar validação de UUID, ação, tamanho máximo de template base64 (mesmo limite de 4 MB atual), limite de replacements (150), e helpers `storagePath`, `isLegalStaff`, `sanitizeMetadata`.

Nenhuma função do core deve aceitar um parâmetro de responsável vindo do cliente.

- [ ] **Step 4: Implementar GET de lista e detalhes**

Em `api/legal-workspace.js`:

```js
const user = await requireUser(req, res);
if (!user) return json(res, 401, { ok: false, error: 'Sessão inválida ou expirada.' });
const token = req.__embrascaAccessToken;
```

GET sem `documentId` chama:

```text
POST /rest/v1/rpc/legal_list_documents
{}
```

GET com `documentId` chama:

```text
POST /rest/v1/rpc/legal_get_document
{ "p_document_id": "..." }
```

Retornar os JSONs do RPC sem confiar em filtros enviados pelo cliente para autorização.

- [ ] **Step 5: Implementar `create_document` com geração + Storage + RPC**

Fluxo exato:

1. gerar `documentId = crypto.randomUUID()`;
2. gerar DOCX com `buildLegalDocx`;
3. calcular `storagePath(user.id, documentId, 1)`;
4. upload via `POST /storage/v1/object/legal-documents/<encoded-path>` com `x-upsert: false`;
5. chamar `legal_create_document` com metadados, `form_data` e `storage_path`;
6. se o RPC falhar, apagar o objeto recém-enviado com `DELETE /storage/v1/object/legal-documents/<encoded-path>`;
7. retornar detalhe fresco via `legal_get_document`.

O corpo aceito deve ser:

```json
{
  "action": "create_document",
  "templateCode": "NDA_BR",
  "templateBase64": "...",
  "replacements": {},
  "title": "NDA - Cliente X",
  "counterparty": "Cliente X",
  "formData": {}
}
```

Não aceitar `ownerId`, `generatedBy`, `reviewedBy` ou `approvedBy` como fonte de autoridade.

- [ ] **Step 6: Implementar `create_version` com controle de concorrência**

Fluxo:

1. obter detalhe autorizado via `legal_get_document`;
2. ler `ownerId` e `currentVersion` do retorno do servidor;
3. gerar `nextVersion = currentVersion + 1`;
4. gerar DOCX e enviar para `ownerId/documentId/v<nextVersion>/documento.docx`;
5. chamar `legal_add_version` com `p_expected_current_version = currentVersion`, `form_data` e `storage_path`;
6. se RPC retornar conflito, apagar o objeto enviado e responder HTTP 409;
7. retornar detalhe atualizado.

- [ ] **Step 7: Implementar ações de workflow**

Mapear:

```js
const ACTION_RPC = {
  submit_review: 'legal_submit_review',
  request_correction: 'legal_request_correction',
  approve: 'legal_approve_document',
};
```

Para `request_correction`, incluir `p_comment`. O endpoint não envia ID do revisor/aprovador; o RPC usa `auth.uid()`.

- [ ] **Step 8: Testar autorização e anti-forja**

No teste, mockar `requireUser`/fetch em nível de módulo ou testar a fonte/handlers com fake fetch e confirmar:

- 401 sem sessão;
- `usuario` não consegue forçar `reviewedBy` no payload;
- o corpo enviado aos RPCs nunca contém IDs de responsáveis;
- erros 403 do Supabase viram resposta 403;
- conflito de versão vira 409;
- falha após upload dispara DELETE de limpeza.

- [ ] **Step 9: Rodar testes**

```bash
node --test legal-workspace-api.test.js supabase-storage.test.js central-auth.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add api/legal-workspace-core.js api/legal-workspace.js legal-workspace-api.test.js
git commit -m "feat: add authenticated legal workspace API"
```

---

### Task 5: Implementar download central autorizado

**Files:**
- Create: `api/legal-download.js`
- Create: `legal-download.test.js`

**Interfaces:**
- Consumes: `legal_get_download_path`, `supabaseRawFetch`.
- Produces: `GET /api/legal-download?documentId=<uuid>&version=<n>` retornando DOCX binário.

- [ ] **Step 1: Escrever teste falhando**

Cobrir 401 sem sessão, 400 para parâmetros inválidos e que o caminho vem do RPC autorizado, não diretamente da query string.

```js
test('download endpoint never constructs storage path from client owner id', () => {
  const source = fs.readFileSync(path.join(__dirname, 'api/legal-download.js'), 'utf8');
  assert.match(source, /legal_get_download_path/);
  assert.doesNotMatch(source, /req\.query\.owner/i);
});
```

- [ ] **Step 2: Rodar RED**

```bash
node --test legal-download.test.js
```

Expected: FAIL porque o endpoint não existe.

- [ ] **Step 3: Implementar endpoint**

1. `requireUser`;
2. validar `documentId` e `version`;
3. chamar `legal_get_download_path` com token da sessão;
4. usar `storage_path` retornado pelo RPC para `GET /storage/v1/object/authenticated/legal-documents/<encoded-path>`;
5. encaminhar bytes com MIME DOCX, `Content-Disposition`, `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.

- [ ] **Step 4: Rodar testes**

```bash
node --test legal-download.test.js legal-workspace-api.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/legal-download.js legal-download.test.js
git commit -m "feat: add authorized legal document download"
```

---

### Task 6: Criar o modelo de apresentação dos responsáveis na UI

**Files:**
- Create: `legal-workspace-core.js`
- Create: `legal-workspace-core.test.js`

**Interfaces:**
- Produces: `responsibleDisplay(document)`, `canReview(user)`, `formatDateTime(value)`, `statusLabel(status)`.

- [ ] **Step 1: Escrever testes falhando**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./legal-workspace-core');

test('responsibleDisplay exposes generated reviewed and approved names', () => {
  assert.deepEqual(core.responsibleDisplay({
    generatedBy: { name: 'Gabriel' },
    reviewedBy: { name: 'Felipe' },
    approvedBy: null,
  }), {
    generated: 'Gabriel',
    reviewed: 'Felipe',
    approved: '—',
  });
});

test('only juridico and admin can review', () => {
  assert.equal(core.canReview({ role: 'usuario' }), false);
  assert.equal(core.canReview({ role: 'juridico' }), true);
  assert.equal(core.canReview({ role: 'admin' }), true);
});
```

- [ ] **Step 2: Rodar RED**

```bash
node --test legal-workspace-core.test.js
```

Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Implementar módulo UMD pequeno e testável**

Seguir o padrão de `task2-core.js`, exportando para Node e `window.EmbrascaLegalWorkspaceCore`.

`responsibleDisplay` deve usar `—` apenas para apresentação, nunca persistir essa string no banco.

- [ ] **Step 4: Rodar GREEN**

```bash
node --test legal-workspace-core.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add legal-workspace-core.js legal-workspace-core.test.js
git commit -m "feat: add legal responsibility presentation core"
```

---

### Task 7: Integrar Documentos e Revisões centralizados à interface existente

**Files:**
- Create: `legal-workspace-ui.js`
- Create: `legal-workspace-ui.test.js`
- Modify: `task2-ui.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `window.EmbrascaCentralAuth.user`, `window.EmbrascaLegalWorkspaceCore`, `/api/legal-workspace`, `/api/legal-download`.
- Produces: lista central de Documentos, detalhes/histórico, ações de revisão/aprovação e responsável visível.

- [ ] **Step 1: Escrever teste falhando de carregamento e permissões visuais**

Testar que `index.html` carrega `legal-workspace-core.js` e `legal-workspace-ui.js` depois de `auth-client.js`/`task2-ui.js`; testar que `task2-ui.js` não esconde mais permanentemente `documentos` e `revisoes`.

```js
assert.match(index, /legal-workspace-core\.js/);
assert.match(index, /legal-workspace-ui\.js/);
assert.ok(index.indexOf('/task2-ui.js') < index.indexOf('/legal-workspace-ui.js'));
```

- [ ] **Step 2: Rodar RED**

```bash
node --test legal-workspace-ui.test.js
```

Expected: FAIL porque os scripts ainda não estão carregados e os menus ainda são escondidos.

- [ ] **Step 3: Ajustar `task2-ui.js` sem mexer no visual do gerador**

Alterar a ocultação inicial para não incluir `[data-s="documentos"]` e `[data-s="revisoes"]`. Remover a ocultação permanente de `#sendReview`; a disponibilidade do botão passará a ser controlada pelo módulo central conforme status/perfil.

Manter Dashboard/Modelos/Config conforme as regras atuais.

- [ ] **Step 4: Carregar os novos módulos em `index.html`**

Adicionar, após `task2-ui.js`:

```html
<script src="/legal-workspace-core.js?v=20260916-responsaveis"></script>
<script src="/legal-workspace-ui.js?v=20260916-responsaveis"></script>
```

- [ ] **Step 5: Implementar cliente de API em `legal-workspace-ui.js`**

Criar helper:

```js
async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Falha no módulo jurídico.');
  return data;
}
```

Expor apenas para depuração controlada `window.EmbrascaLegalWorkspace.refresh()` e `open(documentId)`; não expor funções que aceitem responsáveis manuais.

- [ ] **Step 6: Renderizar lista de Documentos com os três responsáveis**

Ao entrar em `documentos`, chamar GET `/api/legal-workspace` e renderizar em cada item:

```text
Gerado por: Nome
Revisado por: Nome ou —
Aprovado por: Nome ou —
```

Preservar título, contraparte, versão e status existentes. Usar texto via `textContent`, não `innerHTML` com conteúdo vindo do banco.

- [ ] **Step 7: Renderizar detalhes/revisão e histórico**

GET `/api/legal-workspace?documentId=<id>` deve mostrar:

- responsáveis atuais da versão;
- `generatedAt`, última revisão e aprovação;
- histórico de versões, cada uma com `generatedBy.name` e data;
- histórico de revisões com `action`, `reviewedBy.name`, comentário e data.

Para `usuario`, esconder ações jurídicas. Para `juridico/admin`, exibir `Solicitar correção` e `Aprovar` somente quando o status permitir.

- [ ] **Step 8: Conectar ações de revisão**

`Solicitar correção`:

```js
await api('/api/legal-workspace', {
  method: 'POST',
  body: JSON.stringify({ action: 'request_correction', documentId, comment }),
});
```

`Aprovar`:

```js
await api('/api/legal-workspace', {
  method: 'POST',
  body: JSON.stringify({ action: 'approve', documentId }),
});
```

Após qualquer ação, recarregar detalhe e lista. O frontend nunca envia `reviewedBy` ou `approvedBy`.

- [ ] **Step 9: Conectar envio para revisão**

O botão existente `#sendReview` deve chamar:

```js
await api('/api/legal-workspace', {
  method: 'POST',
  body: JSON.stringify({ action: 'submit_review', documentId }),
});
```

Depois atualizar status para `under_review` na tela central.

- [ ] **Step 10: Rodar testes da UI**

```bash
node --test legal-workspace-core.test.js legal-workspace-ui.test.js task2-core.test.js task2-auth.test.js index-loader.test.js browser-history-ui.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add legal-workspace-ui.js legal-workspace-ui.test.js task2-ui.js index.html
git commit -m "feat: show responsible users in legal workspace"
```

---

### Task 8: Integrar geração inicial e novas versões ao Supabase sem quebrar o download

**Files:**
- Modify: `docx-patch.js`
- Modify: `legal-workspace-ui.js`
- Create: `legal-generation-integration.test.js`

**Interfaces:**
- Consumes: objeto de documento legado `d` com `templateCode`, `values`, `version`, `status`; `BUILTIN_TEMPLATES`; `valuesForDoc`.
- Produces: criação/versão central + download autorizado da versão persistida.

- [ ] **Step 1: Escrever teste falhando da integração**

Testar por inspeção e helpers que o fluxo novo chama `/api/legal-workspace` para persistir antes do download e que não envia campos de responsável.

```js
assert.match(source, /create_document|create_version/);
assert.match(source, /\/api\/legal-workspace/);
assert.doesNotMatch(source, /generatedBy\s*:/);
assert.doesNotMatch(source, /approvedBy\s*:/);
```

- [ ] **Step 2: Rodar RED**

```bash
node --test legal-generation-integration.test.js
```

Expected: FAIL porque `docx-patch.js` ainda chama apenas `/api/generate-docx`.

- [ ] **Step 3: Separar geração persistida de download legado**

Em `docx-patch.js`, manter `downloadDocxBytes` para compatibilidade, mas adicionar função que delega ao workspace quando disponível:

```js
async function persistLegalDocument(d) {
  const p = prof(d.templateCode);
  const templateBase64 = BUILTIN_TEMPLATES[d.templateCode];
  const replacements = valuesForDoc(p, d.values, d.version, d.status);
  return window.EmbrascaLegalWorkspace.persistGeneratedDocument({
    legacyDocument: d,
    templateBase64,
    replacements,
  });
}
```

Se o workspace estiver carregado e autenticado, `downloadDoc` deve persistir/identificar a versão central e baixar pelo endpoint central. O fallback `/api/generate-docx` só deve permanecer para compatibilidade temporária quando o módulo central explicitamente não estiver disponível, nunca quando uma persistência central falhar.

- [ ] **Step 4: Implementar `persistGeneratedDocument` na UI central**

Para documento sem `centralDocumentId`:

```json
{
  "action": "create_document",
  "templateCode": "...",
  "templateBase64": "...",
  "replacements": {},
  "title": "...",
  "counterparty": "...",
  "formData": {}
}
```

Guardar o `document.id` retornado no objeto legado apenas como ponte de sessão (`d.centralDocumentId`), sem tratá-lo como fonte oficial.

Para documento já centralizado e corrigido, enviar `action: create_version` com `documentId`.

Depois chamar:

```text
GET /api/legal-download?documentId=<id>&version=<currentVersion>
```

converter a resposta em `Uint8Array` e usar `downloadDocxBytes` existente.

- [ ] **Step 5: Garantir que o responsável da versão vem do servidor**

O payload de geração não deve conter usuário, nome, e-mail ou IDs de responsável. O servidor/RPC usa a sessão autenticada. Adicionar assertions explícitas no teste.

- [ ] **Step 6: Rodar integração e regressão DOCX**

```bash
node --test legal-generation-integration.test.js legal-workspace-api.test.js legal-download.test.js legal-docx-service.test.js legal-service-layout.test.js docx-engine.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add docx-patch.js legal-workspace-ui.js legal-generation-integration.test.js
git commit -m "feat: persist generated legal document versions"
```

---

### Task 9: Verificação de segurança, fluxo completo e regressão

**Files:**
- Modify only if a failing verification exposes a defect in files from Tasks 1–8.

**Interfaces:**
- Verifies: fluxo completo e critérios de aceite da spec.

- [ ] **Step 1: Rodar a suíte Node completa**

```bash
node --test *.test.js
```

Expected: 0 failures.

- [ ] **Step 2: Verificar no Supabase os papéis e as tabelas**

Usar duas contas de teste quando disponíveis:

- conta `usuario` cria documento;
- confirmar `legal_document_versions.generated_by` igual ao UUID da conta;
- tentar enviar `generatedBy` falso pelo request e confirmar que o banco ignora/não possui parâmetro para isso;
- conta `usuario` tentar `request_correction` e `approve`: deve receber 403/erro de autorização;
- conta `juridico` solicitar correção: `reviewed_by` deve ser o UUID do jurídico;
- gerar nova versão com outra conta autorizada: `generated_by` da nova versão muda, a versão anterior permanece intacta;
- aprovar diretamente uma versão sem correção: a lista/detalhe deve mostrar a mesma pessoa em `Revisado por` e `Aprovado por`.

- [ ] **Step 3: Verificar isolamento entre versões**

Após aprovação da versão N, criar versão N+1 e confirmar via `legal_get_document`:

```text
Gerado por = gerador da N+1
Revisado por = —
Aprovado por = —
```

O histórico deve continuar contendo revisão/aprovação da versão N.

- [ ] **Step 4: Verificar UI em dois perfis**

`usuario`:
- vê apenas documentos próprios;
- vê os três campos de responsável;
- não vê botões de aprovação/correção.

`juridico/admin`:
- vê todos os documentos;
- vê os três responsáveis;
- consegue revisar/aprovar.

- [ ] **Step 5: Verificar DOCX do contrato de prestação**

Gerar `MINUTA_PRESTACAO_SERVICOS` pelo fluxo central e abrir o arquivo final. Confirmar:

- sem template verde;
- página 1 sem campos de visto;
- páginas seguintes com `Visto Contratada:` e `Visto Contratante:`;
- conteúdo jurídico não recebe `Gerado por`, `Revisado por` ou `Aprovado por`.

- [ ] **Step 6: Verificar download e acesso**

- usuário proprietário baixa versão própria;
- usuário comum diferente não consegue baixar documento alheio;
- `juridico/admin` consegue baixar documento autorizado;
- request sem sessão retorna 401.

- [ ] **Step 7: Conferir estado final da `main`**

```bash
git status --short
git log --oneline -8
```

Expected: working tree limpo e commits das tarefas presentes na `main`.

- [ ] **Step 8: Commit corretivo apenas se necessário**

Se a verificação revelar defeito, escrever primeiro um teste reproduzindo-o, corrigir e então:

```bash
git add <arquivos-do-fix>
git commit -m "fix: complete legal responsibility audit flow"
```
