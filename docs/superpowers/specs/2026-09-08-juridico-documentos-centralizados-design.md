# Embrasca Jurídico — Documentos e Revisões Centralizados

## Objetivo

Transformar Documentos e Revisões em recursos corporativos centralizados no Supabase, eliminando a dependência do armazenamento local do navegador e aplicando autorização por perfil no servidor.

## Perfis e acesso

- `usuario`: pode gerar documentos, listar/baixar/corrigir os próprios documentos e acompanhar as próprias revisões.
- `juridico`: pode acessar Dashboard, Gerar documento, Documentos, Revisões e Modelos Jurídicos; enxerga todos os documentos e executa revisão jurídica.
- `admin`: possui o mesmo acesso operacional do Jurídico e, adicionalmente, Configurações e Administração.

A interface apenas reflete essas regras. A autorização real será aplicada no banco/API.

## Persistência

Serão criadas as tabelas:

- `legal_documents`: registro principal do documento, solicitante, modelo, parte, status e versão atual.
- `legal_document_versions`: uma linha por versão gerada, incluindo os dados de preenchimento e o caminho privado do DOCX.
- `legal_reviews`: histórico de envio, aprovação e solicitação de correção.

Os arquivos DOCX serão armazenados no bucket privado `legal-documents` do Supabase Storage. O caminho seguirá `owner_id/document_id/vN/arquivo.docx`.

## Segurança

- RLS habilitado nas três tabelas.
- Usuário comum lê apenas documentos/revisões de que é proprietário.
- Jurídico e Administrador leem todos os documentos/revisões.
- Usuário comum pode criar seus registros e novas versões dos próprios documentos, mas não pode aprovar revisão.
- Apenas Jurídico/Administrador podem registrar `Aprovado` ou `Correção solicitada`.
- O bucket é privado; download exige sessão válida e respeita as mesmas permissões.
- Nenhuma chave `service_role` será exposta no navegador.

## Integração com a interface existente

A tela atual será preservada visualmente. Um módulo `legal-workspace.js` fará a ponte entre as funções legadas e a API central:

1. ao criar uma minuta/NDA/MoU, o registro é salvo centralmente;
2. ao baixar, o DOCX é gerado com o modelo oficial, enviado ao armazenamento privado e baixado para o usuário;
3. Documentos passa a listar a visão central permitida pelo perfil;
4. Enviar revisão grava o estado central e torna o item visível para Jurídico/Admin;
5. Revisões permite ao Jurídico/Admin aprovar ou solicitar correção com comentário;
6. nova versão preserva o mesmo documento raiz e incrementa a versão.

## Compatibilidade

Os modelos jurídicos e a lógica fixa dos DOCX não serão alterados. O estado local existente continua apenas como compatibilidade temporária da tela; a fonte oficial para Documentos e Revisões passa a ser o Supabase.

## Critérios de aceite

1. dois usuários em computadores/navegadores diferentes enxergam os dados compatíveis com seus perfis;
2. usuário comum vê Documentos e Revisões, mas somente seus registros;
3. Jurídico/Admin vê documentos e revisões de todos;
4. documento gerado por usuário aparece para Jurídico/Admin sem depender do navegador do criador;
5. revisão altera o status de forma central e auditável;
6. versões anteriores continuam disponíveis;
7. download sem sessão ou sem permissão é recusado;
8. DOCX continua abrindo normalmente e preserva o texto jurídico aprovado;
9. Configurações/Administração permanecem restritas ao administrador.