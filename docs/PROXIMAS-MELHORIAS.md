# Próximas melhorias

Lista do que ainda vale melhorar, em ordem de prioridade. Cada item é pequeno o bastante para virar **uma branch e um Pull Request**.

| # | Melhoria | Por que | Onde |
|---|---|---|---|
| 1 | Paginação no servidor para `/api/dados` e `/api/atividades` | Hoje tudo vem de uma vez. Ótimo com poucos registros, pesado com milhares | `src/lib/consultas.ts`, `src/hooks/useApi.ts` |
| 2 | Tema escuro com variáveis CSS | As ~40 regras `.tema-escuro .bg-white {... !important}` precisam crescer a cada cor nova | `src/app/globals.css`, componentes |
| 3 | Quebrar componentes grandes | `manutencoes-view.tsx` e `licencas-view.tsx` misturam filtros, quadro, formulários e linhas muito longas | `src/components/` |
| 4 | Testes de ponta a ponta (Playwright) | Os testes atuais cobrem a API; nenhum clica nas telas | nova pasta `e2e/` |
| 5 | Ações rápidas no dashboard | "Nova usina", "Nova manutenção" direto da tela inicial | `src/app/(app)/dashboard/page.tsx` |
| 6 | Snapshot por migração | Hoje só existe o snapshot da última migração (suficiente para o `db:generate`); manter um por migração facilita auditoria | `src/lib/db/migrations/meta/` |
| 7 | Acompanhar o `drizzle-kit` | O `npm audit` aponta 4 alertas moderados no `esbuild` antigo que ele usa. Só afeta a ferramenta de desenvolvimento, não o site | `package.json` |

---

## Prompt para usar com outra IA (ChatGPT, Claude etc.)

Copie o bloco abaixo, troque o `<ITEM>` por uma linha da tabela e envie junto com os arquivos citados na coluna "Onde".

```
Você é um engenheiro sênior revisando o Solaria Management
(Next.js 16 App Router, React 19, TypeScript estrito, PostgreSQL + Drizzle,
TanStack Query, Zod, Tailwind 4). Sou estudante e quero entender cada mudança.

TAREFA: <ITEM>

O QUE VOCÊ PRECISA SABER
- O projeto JÁ passa em `npm run verificar` (lint, tipos, 34 testes com
  PostgreSQL real e build). Isso é a linha de base: se quebrar, o erro é da mudança.
- Leia docs/ARQUITETURA.md antes de propor algo.
- Você não executa código. Nunca diga "testei". Diga "deve funcionar porque..."
- Se precisar de um arquivo que não enviei, PEÇA. Não invente o conteúdo.

REGRAS
1. Uma tarefa por resposta, no máximo 4 arquivos.
2. Antes de editar: liste objetivo, arquivos, o que pode quebrar e quais
   testes cobrem isso.
3. Não mude nomes de rotas, colunas, tipos ou contratos da API sem justificar
   e listar todos os lugares que usam.
4. Não adicione nem atualize bibliotecas.
5. Mudança no banco só com migração nova via `npm run db:generate`. Se o SQL
   tiver DROP, pare e me avise.
6. Não remova validação Zod, `exigir()`, permissões, CSRF ou CSP.
7. Sem `any`. Mensagens e nomes em português.
8. Use as cores da marca (`marca-*`, `sol-*`) e os componentes de
   src/components/ui.tsx em vez de criar novos.
9. Mudou comportamento? Adicione ou ajuste um teste em src/__tests__/.
10. Entregue cada arquivo alterado COMPLETO, com o caminho no topo.

FORMATO DA RESPOSTA
A) Objetivo  B) Riscos  C) Arquivos completos  D) Testes
E) Resultado esperado do `npm run verificar`
F) Explicação simples do porquê  G) O que ficou de fora de propósito

Se eu colar um erro do `npm run verificar`, corrija SÓ o que falhou.
```
