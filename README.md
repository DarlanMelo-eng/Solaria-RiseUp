# Solaria Management

Plataforma web para gestão de usinas solares: cadastro de usinas, licenças com aviso de vencimento, manutenções com prioridade e responsável, alertas e controle de acesso por perfil.

Projeto da **Residência Tecnológica Motiron Technologies, squad 2**.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Drizzle ORM · TanStack Query · React Hook Form + Zod · Argon2id · Vitest

---

## Rodando na sua máquina (Windows, macOS ou Linux)

Você precisa de **Node.js 22+**, **Git** e **PostgreSQL**. O jeito mais fácil de ter o PostgreSQL é o **Docker Desktop**; se preferir, instale o PostgreSQL 16+ direto.

**Atenção:** este projeto ainda **não tem modo demonstração independente do banco**. Para usar login, dashboard e cadastros, o PostgreSQL deve estar ativo e migrado. O `docker-compose.yml` sobe somente o PostgreSQL; o Next.js roda com `npm run dev`.

```powershell
git clone <url-do-repositorio>
cd solaria-management
npm install
copy .env.example .env        # macOS/Linux: cp .env.example .env
```

Abra o `.env` e preencha:

| Variável | O que colocar |
|---|---|
| `SESSION_SECRET` | Rode `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` e cole o resultado |
| `POSTGRES_PASSWORD` | Uma senha qualquer para o banco local |
| `DATABASE_URL` | Troque `SENHA_AQUI` pela mesma senha acima |
| `TEST_DATABASE_URL` | Mesma senha, banco `solaria_test` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NOME`, `SEED_ADMIN_SENHA` | A primeira conta de administrador (senha com 10+ caracteres) |

Depois:

```powershell
docker compose up -d     # sobe o PostgreSQL e cria os bancos solaria e solaria_test
# Verifique se DATABASE_URL aponta para o banco NOVO, nunca para o banco antigo.
# No PowerShell, a trava de proteção exige a confirmação do nome do banco:
$env:CONFIRMO_BACKUP='solaria'
npm run db:migrate       # cria as tabelas no banco NOVO
Remove-Item Env:CONFIRMO_BACKUP
npm run db:seed          # cria o admin e dados de exemplo (pode rodar de novo, não apaga nada)
npm run dev              # abre em http://localhost:3000
```

> Se a senha tiver caracteres como `@`, `#` ou `/`, eles precisam ser codificados na `DATABASE_URL` (ex.: `@` vira `%40`). Para evitar dor de cabeça, use só letras e números na senha local.

> Sem Docker? Crie os bancos `solaria` e `solaria_test` no seu PostgreSQL e ajuste as duas URLs.

**A primeira visita a cada página no `npm run dev` demora mais.** É o Next.js compilando aquela página na hora; depois fica rápido. No Windows, ajuda muito tirar a pasta do projeto do OneDrive e adicioná-la às exclusões do antivírus.

---

## Comandos

| Comando | Para que serve |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run verificar` | **Roda tudo antes de abrir um PR:** lint, tipos, testes e build |
| `npm test` | Testes (unitários + integração com PostgreSQL, se `TEST_DATABASE_URL` existir) |
| `npm run lint` / `npm run typecheck` | Estilo do código / erros de tipo |
| `npm run build` e `npm start` | Versão de produção (o `start` exige as variáveis de produção) |
| `npm run db:migrate` | Aplica as migrações pendentes |
| `npm run db:generate` | Gera uma nova migração depois de mudar `src/lib/db/schema.ts` |
| `npm run db:seed` | Admin + dados de exemplo |

---

## Estrutura de pastas

```
src/
├── app/                  Páginas e rotas (App Router)
│   ├── (app)/            Área logada: dashboard, usinas, licenças, manutenções, alertas, perfil, usuários
│   ├── api/              API REST (cada pasta é uma rota)
│   ├── login/, esqueci-senha/, redefinir-senha/
│   └── page.tsx          Página pública de apresentação
├── components/           Componentes de interface reutilizáveis
├── hooks/useApi.ts       Comunicação com a API e cache (TanStack Query)
├── lib/                  Regras do servidor: sessão, senhas, permissões, e-mail, consultas
│   └── db/               Schema do banco, migrações e seed
├── schemas/              Validações com Zod (usadas no navegador e no servidor)
├── types/, utils/        Tipos e funções auxiliares
├── proxy.ts              Protege as rotas e aplica a política de segurança (CSP)
└── __tests__/            Testes automatizados
```

Para entender **por que** o código foi feito assim, leia [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Perfis de acesso

| Perfil | Pode |
|---|---|
| **Administrador** | Tudo, inclusive convidar usuários e mudar permissões |
| **Gestor** | Criar e editar usinas, licenças e manutenções |
| **Consulta** | Apenas visualizar |

---

## Produção

O `npm start` se recusa a subir sem: `SESSION_SECRET`, `DATABASE_URL` com `DATABASE_SSL=true`, `APP_URL` com `https://`, `SMTP_HOST` e `SMTP_FROM`. Isso é proposital: impede publicar o sistema inseguro por engano.

- Rode `npm run db:migrate` antes de cada deploy. **Faça backup do banco antes.**
- Nunca rode `db:seed` automaticamente em produção.
- `TRUST_PROXY=true` só se o servidor estiver atrás de um proxy que reescreve o `X-Forwarded-For`.

---

## Contribuindo

Veja [`CONTRIBUTING.md`](CONTRIBUTING.md): fluxo com branches, Pull Requests e o que conferir antes de pedir revisão.

> Situação desta cópia para GitHub: versão até o Lote 13. A API de documentos do Lote 14 ainda não está integrada e telas de anexos ainda não existem. Para a revisão acadêmica veja `docs/ESTADO-DO-PROJETO.md`.
