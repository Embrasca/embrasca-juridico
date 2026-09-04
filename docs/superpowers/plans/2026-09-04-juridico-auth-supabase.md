# Embrasca Jurídico Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um Supabase/PostgreSQL exclusivo para o Embrasca Jurídico e conectar o sistema existente a uma autenticação central sem bypass, com perfis e permissões lidos do banco.

**Architecture:** O Supabase Auth autentica credenciais e emite access/refresh tokens. O backend Vercel guarda os tokens apenas em cookies `HttpOnly`, consulta `public.profiles` com o token do próprio usuário e só libera rotas protegidas quando a sessão e o perfil estiverem válidos. O frontend mantém a tela principal bloqueada por um gate visual até `GET /api/session` confirmar autenticação.

**Tech Stack:** Supabase Auth, PostgreSQL 17, Row Level Security, JavaScript CommonJS em Vercel Functions, HTML/JavaScript browser, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-04-juridico-auth-supabase-design.md`

## Global Constraints

- Projeto Supabase dedicado: `embrasca-juridico`.
- Organização Supabase: `TI_Embrasca`.
- Região: `sa-east-1`.
- Senhas são gerenciadas exclusivamente pelo Supabase Auth.
- Nenhuma senha, access token ou refresh token pode ser persistido em `localStorage`.
- Cookies de sessão: `HttpOnly`, `Secure`, `SameSite=Strict`.
- O perfil e a autorização da aplicação devem vir de `public.profiles`, não de metadata controlável pelo cliente.
- `SUPABASE_SERVICE_ROLE_KEY` não é requisito para login/sessão comum e nunca pode ser exposta no frontend.
- `POST /api/generate-docx` deve exigir sessão válida.
- Não alterar modelos DOCX nem texto jurídico.

---

### Task 1: Provisionar o Supabase dedicado

**Files:**
- No code changes in this task.

**Interfaces:**
- Produces: `project_id`, `SUPABASE_URL` e uma publishable/anon key ativa do projeto `embrasca-juridico`.

- [ ] **Step 1: Confirmar o custo do novo projeto**

Consultar o custo de `project` para a organização `TI_Embrasca` antes de qualquer criação. Apresentar o valor e recorrência ao usuário e obter confirmação formal pelo fluxo de custo da ferramenta.

Expected: um `confirm_cost_id` válido para criação do projeto.

- [ ] **Step 2: Criar o projeto**

Criar:

```text
name: embrasca-juridico
organization: TI_Embrasca
region: sa-east-1
```

Expected: projeto criado com um `project_id` próprio, diferente de `oitxyhvoibpzauiwdejh` (Caçarola Curiosa).

- [ ] **Step 3: Aguardar o banco ficar operacional**

Consultar o projeto até o status deixar de ser `COMING_UP` e ficar pronto para consultas/migrations.

Expected: conexão PostgreSQL disponível.

- [ ] **Step 4: Obter configuração pública**

Obter a URL do projeto e uma publishable key ativa.

Expected:

```text
SUPABASE_URL=https://<novo-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Não registrar a chave em commit, documentação pública ou resposta que exponha segredo. A publishable key pode ser configurada no ambiente de deploy, mas deve continuar fora do repositório.

---

### Task 2: Criar `profiles`, trigger e RLS

**Files:**
- Create: `supabase/migrations/20260904_create_profiles.sql`

**Interfaces:**
- Consumes: `auth.users` do novo projeto Supabase.
- Produces: `public.profiles`, `public.handle_new_user()`, `public.set_updated_at()` e políticas RLS de leitura própria.

- [ ] **Step 1: Criar o arquivo de migration no repositório**

Conteúdo completo:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'usuario'
    check (role in ('admin', 'juridico', 'usuario')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, role, active)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      new.email,
      'Usuário'
    ),
    'usuario',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

revoke insert, update, delete on public.profiles from authenticated;
```

- [ ] **Step 2: Commitar a migration antes de aplicá-la**

```bash
git add supabase/migrations/20260904_create_profiles.sql
git commit -m "feat: add juridico profiles schema and rls"
```

- [ ] **Step 3: Aplicar a migration no novo projeto**

Aplicar exatamente o conteúdo acima usando o mecanismo de migrations do Supabase com o nome:

```text
create_juridico_profiles
```

Expected: migration registrada e concluída sem erro.

- [ ] **Step 4: Verificar estrutura e políticas**

Executar:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'profiles';

select relrowsecurity
from pg_class
where oid = 'public.profiles'::regclass;
```

Expected: tabela com 7 colunas, política `profiles_select_own` e `relrowsecurity = true`.

- [ ] **Step 5: Rodar Security Advisor**

Expected: nenhuma vulnerabilidade nova de RLS relacionada a `public.profiles`.

---

### Task 3: Tornar `public.profiles` a fonte de autorização

**Files:**
- Create: `api-supabase-profile.test.js`
- Modify: `api/_supabase.js`
- Modify: `api/login.js`
- Modify: `central-auth.test.js`

**Interfaces:**
- Consumes: Supabase Auth `/auth/v1/user` e REST `/rest/v1/profiles` usando o access token do usuário.
- Produces: `fetchOwnProfile(token, userId)`, `publicUser(authUser, profile)`, `validateAccessToken(token)` e `resolveSession(req, res)` que retornam somente usuário com perfil ativo.

- [ ] **Step 1: Escrever testes falhando para configuração sem service role e perfil autoritativo**

Criar `api-supabase-profile.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('./api/_supabase');

function loadFresh() {
  delete require.cache[modulePath];
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  return require('./api/_supabase');
}

test('login comum nao depende de service role', () => {
  const auth = loadFresh();
  assert.equal(auth.config().configured, true);
  assert.equal(auth.config().adminConfigured, false);
});

test('role e active vem do profile do Postgres e nao de user metadata', () => {
  const auth = loadFresh();
  const user = auth.publicUser(
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'gabriel@example.com',
      user_metadata: { role: 'admin', active: true, name: 'Metadata' },
    },
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'gabriel@example.com',
      name: 'Gabriel',
      role: 'juridico',
      active: false,
    },
  );

  assert.equal(user.name, 'Gabriel');
  assert.equal(user.role, 'juridico');
  assert.equal(user.active, false);
});
```

- [ ] **Step 2: Rodar os testes e confirmar RED**

Run:

```bash
node --test api-supabase-profile.test.js
```

Expected: FAIL porque `adminConfigured` e a assinatura autoritativa de `publicUser(authUser, profile)` ainda não existem.

- [ ] **Step 3: Implementar configuração separada de admin**

Em `api/_supabase.js`, `config()` deve retornar:

```js
function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    url,
    anon,
    service,
    configured: Boolean(url && anon),
    adminConfigured: Boolean(url && service),
  };
}
```

Admin requests must fail explicitly when `adminConfigured` for false; login/session comuns continuam usando apenas `configured`.

- [ ] **Step 4: Implementar leitura do perfil com o token do usuário**

Adicionar em `api/_supabase.js`:

```js
async function fetchOwnProfile(token, userId) {
  if (!token || !userId) return null;
  const id = encodeURIComponent(userId);
  const r = await supabaseFetch(
    `/rest/v1/profiles?id=eq.${id}&select=id,email,name,role,active`,
    { token },
  );
  if (!r.ok || !Array.isArray(r.data) || r.data.length !== 1) return null;
  return r.data[0];
}

function publicUser(authUser, profile) {
  if (!authUser || !profile || authUser.id !== profile.id) return null;
  return {
    id: authUser.id,
    email: String(profile.email || authUser.email || '').toLowerCase(),
    name: profile.name || profile.email || authUser.email || 'Usuário',
    role: ['admin', 'juridico', 'usuario'].includes(profile.role) ? profile.role : 'usuario',
    active: profile.active === true,
  };
}
```

`supabaseFetch()` deve enviar `Authorization: Bearer <token>` também para chamadas REST do usuário.

- [ ] **Step 5: Fazer validação de token exigir perfil ativo**

`validateAccessToken(token)` deve:

```js
async function validateAccessToken(token) {
  if (!token) return null;
  const authResponse = await supabaseFetch('/auth/v1/user', { token });
  if (!authResponse.ok || !authResponse.data?.id) return null;

  const profile = await fetchOwnProfile(token, authResponse.data.id);
  const user = publicUser(authResponse.data, profile);
  return user?.active ? user : null;
}
```

`resolveSession()` deve aplicar a mesma consulta de perfil após renovar o refresh token, usando o novo `access_token`.

- [ ] **Step 6: Fazer login retornar usuário do PostgreSQL**

Em `api/login.js`, após o password grant:

```js
const profile = await fetchOwnProfile(r.data.access_token, r.data.user.id);
const user = publicUser(r.data.user, profile);

if (!user || !user.active) {
  return json(res, 403, { error: 'Usuário desativado ou sem perfil de acesso.' });
}
```

Atualizar o import para incluir `fetchOwnProfile`.

- [ ] **Step 7: Atualizar teste estrutural da autenticação**

Em `central-auth.test.js`, exigir referências a `/rest/v1/profiles`, `fetchOwnProfile` e `adminConfigured`, e garantir que `publicUser` não derive `role` de `user_metadata`/`app_metadata`.

- [ ] **Step 8: Rodar testes e checks**

Run:

```bash
node --test api-supabase-profile.test.js central-auth.test.js task2-auth.test.js
node --check api/_supabase.js
node --check api/login.js
```

Expected: todos PASS / exit 0.

- [ ] **Step 9: Commitar**

```bash
git add api/_supabase.js api/login.js api-supabase-profile.test.js central-auth.test.js
git commit -m "fix: authorize juridico users from postgres profiles"
```

---

### Task 4: Impedir exibição do sistema antes da validação da sessão

**Files:**
- Modify: `index.html`
- Modify: `auth-client.js`
- Modify: `central-auth.test.js`

**Interfaces:**
- Consumes: `GET /api/session`.
- Produces: gate `#central-auth-gate` que impede `#app` e `#setup` de aparecerem até autenticação central válida.

- [ ] **Step 1: Escrever teste falhando para o gate**

Adicionar em `central-auth.test.js`:

```js
test('app fica visualmente bloqueado ate a sessao central ser validada', () => {
  const index = read('index.html');
  const client = read('auth-client.js');
  assert.match(index, /central-auth-gate/);
  assert.match(index, /#app\s*,\s*#setup/);
  assert.match(client, /central-auth-gate/);
});
```

- [ ] **Step 2: Rodar e confirmar RED**

Run:

```bash
node --test central-auth.test.js
```

Expected: FAIL por ausência do gate.

- [ ] **Step 3: Injetar o gate antes dos scripts legados**

No loader de `index.html`, antes de `document.write(html)`, inserir no `<head>` do `app.html`:

```js
const authGate = '<style id="central-auth-gate">#app,#setup{display:none!important}</style>';
html = html.replace('</head>', authGate + '</head>');
```

Isto garante que código legado não consiga tornar o conteúdo principal visível antes da validação central.

- [ ] **Step 4: Remover o gate somente após sessão válida**

Em `auth-client.js`, criar:

```js
function releaseAuthGate() {
  document.getElementById('central-auth-gate')?.remove();
}
```

Chamar `releaseAuthGate()` apenas dentro de `forceLoggedIn(user)`, depois de definir o usuário.

`forceLoggedOut()` não remove o gate.

- [ ] **Step 5: Rodar testes**

Run:

```bash
node --test central-auth.test.js index-loader.test.js task2-auth.test.js
node --check auth-client.js
```

Expected: todos PASS / exit 0.

- [ ] **Step 6: Commitar**

```bash
git add index.html auth-client.js central-auth.test.js
git commit -m "fix: gate juridico ui behind verified session"
```

---

### Task 5: Criar e promover o primeiro administrador

**Files:**
- No code changes required unless the provider configuration requires a documented runbook.

**Interfaces:**
- Consumes: usuário criado no Supabase Auth.
- Produces: um registro em `public.profiles` com `role = 'admin'` e `active = true`.

- [ ] **Step 1: Criar o usuário no Supabase Auth**

Criar o primeiro usuário administrativo pelo painel/fluxo oficial do Supabase Auth. Não inserir senha diretamente em SQL e não solicitar ao usuário que envie sua senha no chat.

Expected: `auth.users` contém o usuário e o trigger cria automaticamente `public.profiles` com `role = 'usuario'`.

- [ ] **Step 2: Promover o usuário por SQL administrativo**

Depois de confirmar o e-mail correto, executar no projeto:

```sql
update public.profiles
set role = 'admin', active = true, updated_at = now()
where lower(email) = lower('<EMAIL_ADMIN_CONFIRMADO>');
```

Antes de executar, substituir `<EMAIL_ADMIN_CONFIRMADO>` pelo e-mail efetivamente criado no Auth; não adivinhar outro endereço.

- [ ] **Step 3: Confirmar o perfil**

Executar:

```sql
select id, email, name, role, active
from public.profiles
where lower(email) = lower('<EMAIL_ADMIN_CONFIRMADO>');
```

Expected: exatamente uma linha com `role = 'admin'` e `active = true`.

---

### Task 6: Configurar produção na Vercel e verificar ponta a ponta

**Files:**
- No repository file must contain deployment keys.
- Verify: `api/login.js`, `api/session.js`, `api/logout.js`, `api/generate-docx.js`, `auth-client.js`, `index.html`.

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_ANON_KEY` do novo projeto.
- Produces: produção conectada exclusivamente ao Supabase `embrasca-juridico`.

- [ ] **Step 1: Garantir acesso ao projeto Vercel correto**

O alvo deve ser o projeto Vercel conectado ao repositório `Embrasca/embrasca-juridico`, na equipe `embrasca`.

Não configurar as variáveis na conta pessoal que contém apenas `embrasca-news` e `radar-embrasca`.

- [ ] **Step 2: Configurar variáveis de produção**

Adicionar no ambiente Production do projeto Jurídico:

```text
SUPABASE_URL=<URL_DO_NOVO_PROJETO>
SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY_DO_NOVO_PROJETO>
```

Não adicionar `SUPABASE_SERVICE_ROLE_KEY` nesta etapa.

- [ ] **Step 3: Forçar novo deploy**

Fazer novo deployment a partir da `main` depois que as variáveis estiverem salvas.

Expected: build/deploy concluído com sucesso.

- [ ] **Step 4: Verificar endpoint de sessão sem cookie**

Request:

```text
GET /api/session
```

Expected: `401` com `{ "user": null }`, e não `503`.

Isto comprova que o deploy recebeu a configuração do novo Supabase.

- [ ] **Step 5: Verificar login inválido**

Request:

```text
POST /api/login
Content-Type: application/json

{"email":"naoexiste@embrasca.com.br","password":"senha-invalida"}
```

Expected: `401`, sem cookie autenticado.

- [ ] **Step 6: Verificar login válido no navegador**

Usando o primeiro administrador:

1. abrir o sistema em janela anônima;
2. confirmar que apenas o login aparece;
3. autenticar com credenciais válidas;
4. confirmar que o gerador aparece somente depois do login;
5. recarregar a página e confirmar que a sessão é preservada;
6. clicar em logout e confirmar retorno à tela de login.

Expected: todos os itens acima funcionam sem `localStorage` de senha/token.

- [ ] **Step 7: Verificar proteção do DOCX sem sessão**

Request:

```text
POST /api/generate-docx
```

sem cookies válidos.

Expected: `401` com `Sessão inválida ou expirada.`.

- [ ] **Step 8: Verificar geração DOCX autenticada**

Gerar um documento de teste usando um dos modelos já incorporados.

Expected: resposta `200` com MIME:

```text
application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

O arquivo deve continuar abrindo como `.docx` e o texto jurídico fixo não pode ser alterado.

- [ ] **Step 9: Rodar a suíte completa local/CI**

Run:

```bash
node --test
node --check auth-client.js
node --check api/_supabase.js
node --check api/login.js
node --check api/session.js
node --check api/logout.js
node --check api/generate-docx.js
```

Expected: zero testes falhando e todos os checks com exit 0.

- [ ] **Step 10: Verificação final de segurança**

Confirmar:

```text
- produção aponta para o project ref do novo embrasca-juridico;
- RLS está habilitado em public.profiles;
- usuário comum lê apenas o próprio profile;
- role/active vêm do PostgreSQL;
- app não aparece antes de /api/session;
- logout limpa cookies;
- generate-docx rejeita acesso sem sessão;
- nenhum segredo foi commitado no GitHub.
```

Só declarar a correção concluída depois desta verificação.
