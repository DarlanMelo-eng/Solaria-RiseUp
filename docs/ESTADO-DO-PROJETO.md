# Estado do projeto para revisão acadêmica — 24/11/2026

Este repositório é o **Solaria Management**, versão de desenvolvimento até o **Lote 13**. O código foi extraído de uma cópia local e limpo para compartilhamento, sem arquivos `.env` privados nem `node_modules`.

## O que existe no código

- Next.js 16 / React 19 / TypeScript, formulários, tabelas e layout responsivo.
- Autenticação/sessões e perfis de usuário; gestão de usinas, licenças e manutenções.
- CRUD, tela e API de condicionantes ambientais, cumprimentos e histórico.
- Esquema PostgreSQL, migrações `0000` a `0003` e preparação do armazenamento de documentos.
- 20 arquivos de testes automatizados. A execução local compartilhada pelo desenvolvedor **antes deste ZIP** apresentou **236 testes aprovados**, além de lint, typecheck e build; não foram reexecutados durante a limpeza deste pacote.

## Ainda não concluído

- A versão incluída **não contém as APIs de documentos do Lote 14** nem interface de anexos.
- Ainda falta integrar indicadores e alertas completos de condicionantes ao dashboard.
- Ainda faltam os diagramas de modelos **conceitual, lógico e físico** e o dicionário final de dados.
- Ainda falta comprovar a instalação de ponta a ponta em computador limpo e validar os cadastros pelo navegador.
- **Não há modo demo sem PostgreSQL**. A página inicial pública não substitui os fluxos autenticados.

## Instalação

O `README.md` explica os requisitos. O `docker-compose.yml` sobe **apenas PostgreSQL**, não o app; com o banco ativo, preencha um `.env` **local e não versionado**, migre um banco **novo** e execute `npm run db:seed` e `npm run dev`.

A migração é protegida por `CONFIRMO_BACKUP=<nome_do_banco>` fora do banco de testes; nunca faça isso sem verificar cuidadosamente o destino de `DATABASE_URL`. **Não execute testes de integração no banco principal**.

## GitHub e segurança

O GitHub guarda **o código, as migrações, os testes e a documentação**, não o banco com dados reais nem as senhas. Arquivos `.env`, backups, `.next`, `node_modules` e caches não devem ser versionados. Esta distribuição foi limpa desses itens, mas é necessário revisar também o histórico anterior do repositório antes de publicar.
