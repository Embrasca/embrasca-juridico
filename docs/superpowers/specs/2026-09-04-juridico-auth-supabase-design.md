# Embrasca Jurídico — Autenticação com Supabase/PostgreSQL

## Objetivo

Eliminar o bypass de autenticação do sistema Embrasca Jurídico e estabelecer uma autenticação central segura, persistente e verificável, usando um projeto Supabase dedicado ao Jurídico.

## Decisão arquitetural

A solução adotará **Supabase Auth + PostgreSQL**.

- O Supabase Auth será responsável por credenciais, hash de senha, emissão/renovação de sessão e recuperação de acesso.
- O PostgreSQL armazenará os perfis e permissões da aplicação.
- O navegador não armazenará senha nem token sensível em `localStorage`.
- A sessão será mantida por cookies `HttpOnly`, `Secure` e `SameSite=Strict` emitidos pelo backend.

## Fluxo de autenticação

### Login

1. O usuário informa e-mail e senha na tela existente.
2. O frontend envia as credenciais para `POST /api/login`.
3. O backend autentica no Supabase Auth.
4. Em caso de sucesso, o backend grava access token e refresh token em cookies `HttpOnly`.
5. O backend retorna apenas os dados públicos do usuário.
6. O frontend libera a aplicação.

### Reabertura e recarregamento

1. Ao iniciar, o frontend chama `GET /api/session`.
2. O backend valida o access token.
3. Se o token estiver expirado e houver refresh token válido, a sessão é renovada.
4. Usuário sem sessão válida permanece na tela de login.

### Logout

1. O frontend chama `POST /api/logout`.
2. O backend expira os cookies de sessão.
3. A interface volta para a tela de login.

## Proteção de recursos

`POST /api/generate-docx` exigirá uma sessão válida antes de gerar qualquer documento.

Nenhum endpoint sensível deverá confiar apenas em estado de interface ou variável JavaScript do navegador.

## Estrutura de dados

Será criado um projeto Supabase exclusivo chamado `embrasca-juridico` na organização `TI_Embrasca`, região `sa-east-1`.

A tabela inicial será `public.profiles`:

- `id uuid primary key` — mesmo identificador de `auth.users.id`
- `email text not null unique`
- `name text not null`
- `role text not null` — valores aceitos: `admin`, `juridico`, `usuario`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## Integração com Auth

Um trigger em `auth.users` criará automaticamente o registro correspondente em `public.profiles` quando um usuário for criado.

As permissões da aplicação serão lidas de `public.profiles`. O perfil não dependerá de dados controláveis livremente pelo usuário no cliente.

## Row Level Security

A tabela `public.profiles` terá RLS habilitado.

Políticas iniciais:

- usuário autenticado pode ler apenas o próprio perfil;
- usuário comum não pode alterar `role` nem `active`;
- operações administrativas de criação, ativação/desativação ou mudança de perfil serão executadas somente por backend administrativo autenticado.

Não será exposta `service_role` no frontend.

## Perfis iniciais

- `admin`: administração de usuários e acesso completo ao sistema;
- `juridico`: uso do gerador e recursos jurídicos autorizados;
- `usuario`: uso básico conforme recursos liberados futuramente.

O primeiro usuário administrativo será criado manualmente no Supabase Auth e terá `role = admin` em `public.profiles`.

## Integração com Vercel

O projeto publicado deverá receber, no mínimo:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY`

A `SUPABASE_SERVICE_ROLE_KEY` só será adicionada se uma funcionalidade administrativa de servidor realmente precisar dela; o login comum não dependerá dessa chave.

## Código existente

A implementação aproveitará a estrutura já iniciada no repositório:

- `auth-client.js`
- `api/login.js`
- `api/session.js`
- `api/logout.js`
- `api/_supabase.js`
- `api/generate-docx.js`

O objetivo é conectar esses componentes ao novo projeto Supabase e remover qualquer dependência restante de autenticação local/legada.

## Tratamento de erros

- credenciais inválidas: `401` sem detalhar qual campo falhou;
- usuário desativado: `403`;
- autenticação não configurada no deploy: `503`;
- sessão ausente/expirada: `401`;
- falha interna inesperada: `500` sem expor segredos ou tokens.

## Segurança

- cookies `HttpOnly`, `Secure`, `SameSite=Strict`;
- nenhum token sensível no `localStorage`;
- nenhuma senha armazenada pela aplicação;
- nenhuma chave administrativa no frontend;
- validação de sessão no servidor para recursos protegidos;
- RLS no PostgreSQL;
- princípio de menor privilégio para perfis.

## Testes de aceitação

A solução será considerada pronta quando todos os itens abaixo forem confirmados:

1. abrir o sistema sem sessão exibe o login;
2. credenciais inválidas não liberam o sistema;
3. usuário válido consegue entrar;
4. recarregar a página mantém sessão válida;
5. logout encerra a sessão;
6. cookie expirado é renovado apenas com refresh token válido;
7. usuário desativado não entra;
8. `POST /api/generate-docx` sem sessão retorna `401`;
9. usuário autenticado continua conseguindo gerar DOCX;
10. nenhuma senha/token de autenticação é persistida no navegador;
11. RLS impede leitura indevida de perfis;
12. o deploy de produção usa exclusivamente o Supabase dedicado `embrasca-juridico`.

## Fora do escopo desta etapa

- login por Microsoft Entra ID/SSO;
- MFA próprio da aplicação;
- recuperação de senha com interface customizada;
- auditoria completa de ações de usuários;
- novos módulos jurídicos;
- alteração dos modelos DOCX ou da lógica jurídica dos documentos.
