# Como contribuir

## Fluxo de trabalho

A branch `main` é sempre a versão que funciona. Ninguém faz commit direto nela.

1. Atualize sua cópia: `git switch main` e `git pull`
2. Crie uma branch para a tarefa:
   - `feat/filtro-licencas-por-emissor` para algo novo
   - `fix/data-vencimento-errada` para correção
   - `docs/...`, `refactor/...`, `test/...` para o resto
3. Faça commits pequenos com mensagens claras: `fix: corrige contagem de manutenções atrasadas`
4. Antes de enviar, rode **`npm run verificar`** e só continue se tudo passar
5. `git push -u origin nome-da-branch` e abra um **Pull Request** para a `main`
6. Pelo menos **uma pessoa revisa** antes do merge. O GitHub Actions roda os mesmos testes automaticamente

> Sugestão para o responsável pelo repositório: em *Settings → Branches*, proteja a `main` exigindo PR com 1 aprovação e o check **CI** passando.

## Checklist do Pull Request

- [ ] `npm run verificar` passou na minha máquina
- [ ] Mudou regra de negócio? Adicionei ou atualizei um teste em `src/__tests__/`
- [ ] Mudei `schema.ts`? Rodei `npm run db:generate` e conferi o SQL gerado antes de commitar
- [ ] Nenhum segredo no código (`.env` nunca é commitado)
- [ ] Testei a tela no modo claro, no escuro e numa janela estreita (celular)

## Regras do projeto

- **TypeScript estrito, sem `any`.** Se o tipo está difícil, peça ajuda no PR.
- **Toda entrada é validada com Zod** em `src/schemas/`. O mesmo schema vale no navegador e no servidor.
- **Toda rota da API começa com `exigir(req, permissao)`**. Ela confere sessão, origem (CSRF) e permissão.
- **Mudanças no banco só por migração.** Nunca edite uma migração que já foi aplicada; crie outra.
- Nomes, mensagens e comentários **em português**. Comentários explicam o *porquê*, não o *o quê*.
- Não adicione bibliotecas sem conversar com o time: cada dependência é código a mais para manter e atualizar.

## Mudando o banco de dados

```powershell
# 1. edite src/lib/db/schema.ts
npm run db:generate      # cria src/lib/db/migrations/000X_nome.sql
# 2. LEIA o SQL gerado. Se tiver DROP, pare e converse com o time
npm run db:migrate       # aplica no seu banco local
npm test
```

Commite o `.sql` **e** os arquivos de `migrations/meta/` juntos.

## Ficou com dúvida?

Abra uma *Issue* descrevendo o problema, o que você tentou e a mensagem de erro completa.
