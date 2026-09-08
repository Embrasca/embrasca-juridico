# Embrasca Jurídico — Implementação de Documentos e Revisões Centralizados

**Objetivo:** tornar Documentos e Revisões compartilhados entre usuários autorizados, com persistência no Supabase, histórico de versões, arquivo DOCX privado e autorização real por perfil.

## Task 1 — Banco, RLS e Storage

**Arquivos:**
- Create: `supabase/migrations/20260908_legal_workspace.sql`
- Create: `legal-workspace.test.js`

1. Escrever teste estrutural para exigir as tabelas `legal_documents`, `legal_document_versions`, `legal_reviews`, RLS e bucket `legal-documents` privado.
2. Criar migration com:
   - tabelas e índices;
   - função `is_legal_staff()` baseada em `public.profiles` ativo;
   - RLS de leitura por proprietário ou staff;
   - bucket privado;
   - políticas de Storage por proprietário/staff.
3. Aplicar migration no Supabase `leqpuvahwwzlqbafcmcy`.
4. Verificar tabelas, RLS e bucket.

## Task 2 — Edge Function central do Jurídico

**Arquivos:**
- Create: `supabase/functions/legal-workspace/index.ts`
- Create: `api/legal-workspace.js`
- Modify: `legal-workspace.test.js`

1. Testar contrato da função: autenticação por Bearer token, leitura de `profiles`, criação/listagem de documentos, novas versões, envio para revisão, revisão jurídica e download privado.
2. Implementar `legal-workspace` usando cliente do usuário para identificar o ator e cliente admin apenas dentro da Edge Function.
3. Regras:
   - `usuario`: cria e consulta somente próprios documentos, baixa e cria nova versão própria, envia revisão própria;
   - `juridico/admin`: consulta tudo; pode aprovar ou solicitar correção;
   - ninguém altera proprietário;
   - cada ação gera histórico em `legal_reviews` quando aplicável.
4. Upload de DOCX para bucket privado em `owner/document/vN/arquivo.docx`.
5. Download verifica acesso antes de entregar o arquivo.
6. Criar proxy Vercel `/api/legal-workspace` que usa a sessão central e encaminha o access token sem expô-lo ao navegador.
7. Publicar Edge Function e verificar status ACTIVE.

## Task 3 — Ponte do frontend com o workspace central

**Arquivos:**
- Create: `legal-workspace-core.js`
- Create: `legal-workspace.js`
- Modify: `docx-patch.js`
- Modify: `index.html`
- Modify: `task2-ui.js`
- Modify: `legal-workspace.test.js`

1. Criar regras puras de navegação por perfil:
   - usuario: novo, documentos, revisoes;
   - juridico: dashboard, novo, documentos, revisoes, modelos;
   - admin: dashboard, novo, documentos, revisoes, modelos, config.
2. Remover a ocultação fixa que hoje reduz todos a “Gerar documento”.
3. Expor em `docx-patch.js` uma API segura para gerar bytes do DOCX sem alterar o modelo jurídico.
4. `legal-workspace.js` deve:
   - sincronizar lista central após sessão válida;
   - preencher `S.documents` apenas como cache de interface;
   - substituir criação local por criação central;
   - enviar bytes do DOCX para armazenamento privado;
   - recarregar Documentos após criação/alteração;
   - centralizar envio para revisão e decisão jurídica;
   - permitir ao usuário comum acompanhar apenas as próprias revisões;
   - manter Jurídico/Admin com fila global de revisão.
5. Carregar `legal-workspace-core.js` e `legal-workspace.js` após `task2-ui.js`.

## Task 4 — Compatibilidade com documentos locais já existentes

**Arquivos:**
- Modify: `legal-workspace.js`

1. Detectar registros locais que ainda não possuam `centralId`.
2. Não importá-los silenciosamente para outro usuário.
3. Quando o proprietário local corresponder ao usuário autenticado, permitir importação idempotente para a conta atual, preservando modelo, parte, versão e status suportado.
4. Marcar o cache local com `centralId` após sucesso para evitar duplicação.

## Task 5 — Verificação completa

1. Rodar testes unitários/estruturais do repositório.
2. Verificar sintaxe dos JS alterados.
3. Conferir banco:
   - RLS ativo;
   - bucket privado;
   - políticas presentes;
   - nenhum documento acessível anonimamente.
4. Verificar perfis:
   - usuário comum vê apenas seus documentos;
   - Jurídico/Admin vê todos;
   - usuário comum não consegue aprovar/corrigir revisão.
5. Verificar ciclo:
   - criar documento;
   - listar em Documentos;
   - enviar revisão;
   - revisar como staff;
   - criar nova versão;
   - baixar DOCX privado.
6. Confirmar que os modelos e o conteúdo jurídico fixo não foram modificados.
7. Só considerar concluído após evidência de testes e verificações sem falhas.