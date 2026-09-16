# Embrasca Jurídico — Responsáveis e auditoria de documentos

## Objetivo

Registrar de forma central, automática e auditável quem gerou cada versão de um documento, quem realizou a revisão jurídica e quem concedeu a aprovação final. Os responsáveis serão derivados exclusivamente da conta autenticada e nunca poderão ser escolhidos manualmente.

Esta especificação complementa o desenho de Documentos e Revisões Centralizados de 2026-09-08 e, por depender dele, inclui a implementação da persistência central necessária para que a trilha de responsabilidade seja confiável entre usuários, computadores e sessões diferentes.

## Estado atual

O sistema já possui autenticação central com perfis em `public.profiles`, incluindo os papéis `usuario`, `juridico` e `admin`. A geração de DOCX já funciona no servidor. Entretanto, a persistência central de documentos, versões e revisões desenhada anteriormente ainda não está implementada no repositório.

Por isso, os responsáveis não serão adicionados apenas à interface ou ao armazenamento local. A fonte oficial será o Supabase.

## Regras funcionais aprovadas

### Gerado por

- Identifica o usuário autenticado que gerou a versão atual do documento.
- Em uma nova versão, o responsável passa a ser quem efetivamente gerou essa nova versão.
- O responsável das versões anteriores permanece preservado no histórico.
- O usuário não pode selecionar nem alterar manualmente esse responsável.

### Revisado por

- Identifica o usuário `juridico` ou `admin` que realizou a análise jurídica.
- Ao solicitar correção, o usuário que executou a ação passa a constar como `Revisado por` naquela etapa.
- Se o documento for aprovado diretamente, sem correção anterior, o mesmo usuário responsável pela aprovação será registrado também como revisor.
- Uma nova rodada de revisão pode registrar novo revisor sem apagar o histórico anterior.

### Aprovado por

- Identifica o usuário `juridico` ou `admin` que executou a aprovação final.
- Só é preenchido quando a ação de aprovação for efetivamente concluída.
- Não pode ser informado manualmente pelo cliente.
- Se uma nova versão for criada depois de uma correção, essa versão deverá passar por nova revisão e nova aprovação; a aprovação de uma versão anterior não é herdada como aprovação da nova versão.

## Onde os responsáveis aparecem

Os responsáveis serão exibidos no sistema, e não dentro do conteúdo do DOCX.

### Lista de Documentos

Cada item deve exibir, de forma compacta:

- `Gerado por: <nome>`
- `Revisado por: <nome ou —>`
- `Aprovado por: <nome ou —>`

Para documentos ainda não revisados ou aprovados, o campo correspondente permanece vazio visualmente ou com `—`, sem inventar responsável.

### Detalhes / Revisão

A tela de detalhes/revisão deve mostrar os três responsáveis atuais com nome e, quando útil para auditoria, data/hora da ação:

- versão atual gerada por;
- última revisão realizada por;
- aprovação final realizada por.

A mesma área deve permitir consultar o histórico das versões e revisões sem sobrescrever os responsáveis das etapas anteriores.

## Modelo de dados

A persistência central seguirá três entidades principais.

### `legal_documents`

Registro raiz do documento.

Campos mínimos esperados:

- `id uuid primary key`
- `owner_id uuid not null references profiles(id)` — proprietário/solicitante original
- `template_code text not null`
- `title text`
- `counterparty text`
- `status text not null`
- `current_version integer not null`
- `created_at timestamptz`
- `updated_at timestamptz`

Responsáveis de versão/revisão não devem ser achatados de forma que destruam histórico. A lista poderá receber os responsáveis atuais por consulta/join/view ou por campos derivados, desde que a fonte de verdade permaneça nas versões e revisões.

### `legal_document_versions`

Uma linha por versão gerada.

Campos mínimos esperados:

- `id uuid primary key`
- `document_id uuid not null references legal_documents(id)`
- `version integer not null`
- `generated_by uuid not null references profiles(id)`
- `generated_at timestamptz not null`
- `form_data jsonb not null`
- `storage_path text`
- `created_at timestamptz`

Deve existir unicidade por `(document_id, version)`.

### `legal_reviews`

Histórico imutável das ações jurídicas relevantes.

Campos mínimos esperados:

- `id uuid primary key`
- `document_id uuid not null references legal_documents(id)`
- `version integer not null`
- `action text not null` com valores controlados, no mínimo `correction_requested` e `approved`
- `reviewed_by uuid not null references profiles(id)`
- `comment text`
- `created_at timestamptz not null`

Para uma ação `approved`, o mesmo `reviewed_by` representa também o aprovador final daquela versão. A interface derivará `Aprovado por` da aprovação mais recente válida da versão atual.

## Derivação dos responsáveis atuais

Para a versão atual de um documento:

- `Gerado por` = `generated_by` da linha de `legal_document_versions` correspondente à `current_version`.
- `Revisado por` = usuário da ação jurídica mais recente da versão atual; se a única ação for aprovação direta, será o aprovador.
- `Aprovado por` = usuário da ação `approved` da versão atual, quando existir.

O nome exibido vem de `profiles.name`. O identificador persistido é sempre o UUID do usuário autenticado.

## Fluxos

### Geração inicial

1. usuário autenticado escolhe o modelo e preenche os dados;
2. o servidor identifica o usuário pela sessão;
3. cria `legal_documents`;
4. cria versão `1` em `legal_document_versions` com `generated_by = auth.uid()`;
5. o documento aparece na lista com `Gerado por` preenchido e os demais responsáveis vazios.

### Solicitação de correção

1. `juridico` ou `admin` abre a revisão;
2. solicita correção e informa comentário quando aplicável;
3. o servidor valida o perfil autenticado;
4. grava `legal_reviews(action = correction_requested, reviewed_by = auth.uid())`;
5. `Revisado por` passa a exibir esse usuário;
6. `Aprovado por` continua vazio para a versão atual.

### Nova versão após correção

1. o usuário autorizado corrige o documento;
2. gera uma nova versão;
3. `current_version` é incrementado;
4. a nova linha recebe `generated_by = auth.uid()`;
5. `Gerado por` passa a refletir o criador da nova versão;
6. revisão e aprovação da versão anterior permanecem apenas no histórico;
7. a nova versão inicia sem aprovação herdada.

### Aprovação

1. `juridico` ou `admin` executa `Aprovar`;
2. o servidor valida a sessão e o perfil;
3. grava `legal_reviews(action = approved, reviewed_by = auth.uid())`;
4. se não houve revisão anterior na versão atual, esse mesmo usuário passa a ser também o `Revisado por` exibido;
5. `Aprovado por` passa a exibir esse usuário;
6. o status do documento é atualizado para aprovado.

## Segurança e integridade

- O navegador nunca envia `generated_by`, `reviewed_by` ou `approved_by` como autoridade final.
- O servidor deriva o usuário exclusivamente da sessão autenticada.
- Apenas `juridico` e `admin` podem registrar ações de revisão e aprovação.
- Usuário comum não pode alterar responsáveis nem inserir ações jurídicas.
- RLS deve limitar leitura do usuário comum aos próprios documentos e permitir visão global a `juridico`/`admin` conforme o desenho anterior.
- Nenhuma chave `service_role` será exposta no cliente.
- Responsáveis históricos não devem ser sobrescritos; novas ações geram novos registros.

## API / integração

A implementação deve centralizar as operações em endpoints autenticados ou funções equivalentes no servidor para, no mínimo:

- criar documento e versão inicial;
- listar documentos visíveis para a sessão;
- obter detalhes e histórico;
- criar nova versão;
- solicitar correção;
- aprovar documento;
- baixar a versão permitida.

O frontend recebe nomes e metadados já autorizados pelo servidor e apenas os apresenta.

## Compatibilidade com o DOCX

A inclusão dos responsáveis não altera o conteúdo jurídico dos arquivos DOCX.

Em especial, permanecem intactas as correções já aprovadas para `MINUTA_PRESTACAO_SERVICOS`, incluindo o rodapé jurídico de vistos e a remoção do antigo template corporativo verde.

## Testes obrigatórios

A implementação seguirá TDD e deve cobrir, no mínimo:

1. usuário autenticado vira automaticamente `generated_by` ao criar uma versão;
2. cliente não consegue forjar outro `generated_by`;
3. `usuario` não consegue revisar nem aprovar;
4. `juridico` e `admin` conseguem solicitar correção;
5. quem solicita correção aparece como `Revisado por`;
6. aprovação direta registra a mesma pessoa como `Revisado por` e `Aprovado por`;
7. nova versão altera `Gerado por` para o usuário que a gerou;
8. aprovação/revisão de versão anterior não é herdada pela nova versão;
9. histórico mantém os responsáveis das versões anteriores;
10. lista e detalhes exibem os três responsáveis corretos;
11. permissões de leitura continuam respeitando proprietário e perfil;
12. geração/download de DOCX continua funcionando sem regressão visual ou jurídica.

## Critérios de aceite

1. dois usuários em computadores diferentes veem os mesmos responsáveis conforme suas permissões;
2. não existe campo manual para selecionar responsável;
3. `Gerado por` sempre corresponde ao usuário autenticado que gerou a versão atual;
4. `Revisado por` corresponde ao responsável real pela revisão da versão atual;
5. `Aprovado por` só aparece após aprovação e corresponde ao usuário autenticado que aprovou;
6. aprovação direta também preenche `Revisado por` com o mesmo usuário;
7. nova versão reinicia o ciclo de revisão/aprovação sem apagar o histórico anterior;
8. lista de Documentos e detalhes/revisão exibem os responsáveis;
9. os responsáveis não são inseridos dentro do DOCX;
10. o histórico permanece auditável no Supabase e não depende de `localStorage`.
