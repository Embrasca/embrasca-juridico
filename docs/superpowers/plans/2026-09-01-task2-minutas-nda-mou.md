# Tarefa 2 — MINUTAS, NDAs e MoUs automáticos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar o sistema Embrasca Jurídico para atender exclusivamente à Tarefa 2: selecionar um modelo aprovado de MINUTA, NDA ou MoU, preencher campos variáveis validados, revisar os dados, gerar o DOCX preservando o modelo original e encaminhar para revisão jurídica.

**Architecture:** Preservar `app.html`, os seis modelos Word embutidos e o motor DOCX existente. Adicionar uma camada pequena e testável para validações e uma camada de UI que reduz a experiência ao fluxo da Tarefa 2, sem reescrever o aplicativo legado.

**Tech Stack:** HTML, JavaScript browser, Node.js `node:test`, API Vercel existente para geração DOCX.

**Spec:** Tarefa 2 fornecida pelo usuário em 2026-09-01.

## Global Constraints

- Somente MINUTA, NDA e MoU.
- Usar exclusivamente os modelos Word já aprovados e incorporados.
- Não alterar o texto jurídico fixo dos modelos.
- O arquivo final deve ser entregue diretamente em `.docx`.
- Formulário deve aplicar validações básicas de campos obrigatórios, CPF, CNPJ, e-mail, datas e percentuais quando aplicável.
- Deve existir revisão das informações antes da geração.
- Deve existir encaminhamento para revisão jurídica antes do envio/assinatura.
- Remover da experiência dashboard, histórico geral, gestão de modelos, configurações e administração de usuários.

---

### Task 1: Validações do formulário

**Files:**
- Create: `task2-core.js`
- Test: `task2-core.test.js`

**Interfaces:**
- Produces: `EmbrascaTask2Core.documentType(code)` e `EmbrascaTask2Core.validateField(field, value)`.

- [x] Escrever testes falhando para classificação de documentos, CPF, CNPJ, e-mail e percentual.
- [x] Executar `node --test task2-core.test.js` e confirmar RED.
- [x] Implementar o núcleo mínimo.
- [x] Executar novamente e confirmar GREEN.

### Task 2: Simplificar a experiência para a Tarefa 2

**Files:**
- Create: `task2-ui.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `PROFILES`, `fields`, `collect`, `createDoc`, `renderAll`, `go` e o núcleo de validação.
- Produces: interface focada em geração e revisão jurídica.

- [ ] Ocultar telas e navegação fora do escopo.
- [ ] Abrir diretamente no gerador de documentos.
- [ ] Aplicar validações do núcleo ao formulário.
- [ ] Manter os seis modelos ativos.
- [ ] Exibir instrução explícita de revisão jurídica após a geração.
- [ ] Carregar a camada após `app.html` e antes do uso do sistema.

### Task 3: Verificação

**Files:**
- Verify: `task2-core.js`, `task2-ui.js`, `index.html`, `docx-patch.js`, `api/generate-docx.js`

- [ ] Executar testes Node.
- [ ] Executar `node --check` nos scripts novos.
- [ ] Confirmar que o download continua com MIME DOCX e extensão `.docx`.
- [ ] Confirmar que somente MINUTA, NDA e MoU aparecem na experiência principal.
- [ ] Confirmar que o fluxo termina com orientação de revisão jurídica.
