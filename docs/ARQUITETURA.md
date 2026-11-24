# Como o Solaria funciona (e por quê)

Este documento explica as decisões do projeto em linguagem direta. A ideia é que qualquer pessoa da equipe consiga corrigir um problema sem depender de ninguém.

## 1. O caminho de uma requisição

```
Navegador ──► src/proxy.ts ──► página (src/app/...) ou rota da API (src/app/api/...)
                 │                          │
                 │ confere o cookie         │ exigir(req, permissao)
                 │ aplica a CSP             │   ├─ origem (CSRF)
                 ▼                          │   ├─ sessão válida no banco
           redireciona para /login          │   └─ perfil tem a permissão?
           se não estiver logado            ▼
                                   Zod valida o corpo ──► Drizzle ──► PostgreSQL
```

- **`proxy.ts`** é a primeira porta (no Next 16 o antigo `middleware.ts` virou `proxy.ts`). Ele só faz a checagem rápida do cookie e gera a política de segurança. Não consulta o banco.
- **`exigir()`** (em `src/lib/http.ts`) é a segunda porta, dentro de cada rota. Ela confere no banco se o usuário continua ativo. **Toda rota nova da API deve começar chamando `exigir`.**

## 2. Login e sessão

- A senha é guardada com **Argon2id**, um algoritmo feito para ser lento de propósito. É por isso que o login leva algumas dezenas de milissegundos a mais que outras operações: isso dificulta quem tenta adivinhar senhas.
- Depois do login, o navegador recebe um **cookie assinado com HMAC** (`src/lib/sessao.ts`). Ele contém o id do usuário e uma "versão do token".
- **Trocar a senha incrementa a versão no banco.** Todo cookie antigo deixa de valer na hora, em qualquer computador.
- Errar a senha 5 vezes bloqueia novas tentativas por alguns minutos. O contador fica no PostgreSQL (`tentativas_login`), então funciona mesmo com vários servidores.
- "Esqueci minha senha" responde **sempre a mesma mensagem**, exista o e-mail ou não. Assim ninguém descobre quais e-mails têm conta. O link enviado tem um token de uso único que expira; no banco fica só o *hash* do token.

## 3. Permissões

Ficam em um único lugar: `src/lib/permissoes.ts`. Para mudar o que um perfil pode fazer, mude só ali. A interface esconde botões que o usuário não pode usar, mas **quem garante a regra é o servidor**: esconder um botão não é segurança.

## 4. Por que as telas são rápidas

1. **Uma requisição em vez de três.** As telas precisam de usinas, licenças e manutenções juntas. Em vez de três chamadas, `GET /api/dados` entrega tudo de uma vez, com uma única conferência de sessão.
2. **Os dados já chegam com a página.** Na primeira carga, o layout da área logada (`src/app/(app)/layout.tsx`) busca no servidor a sessão, o perfil e os dados e manda tudo junto com o HTML. Antes, o navegador abria a página vazia e depois fazia 4 chamadas à API; agora faz só 1 (o histórico de atividades). Isso também acabou com o "pisca" do tema escuro e da barra lateral.
3. **Cache no navegador (TanStack Query).** Ao trocar de página, os dados já carregados são reaproveitados por 1 minuto, sem nova chamada.
4. **Atualização sem recarregar tudo.** Quando você cria ou edita algo, a API devolve o registro salvo e a lista em memória é atualizada com ele (`src/lib/mesclar-lista.ts`), sem buscar tudo de novo.
5. **Uma só fonte para as consultas.** `src/lib/consultas.ts` é usado pela API e pelo layout, então os dois sempre devolvem o mesmo formato.

> Limite conhecido: `/api/dados` devolve **todas** as linhas. Com dezenas ou centenas de usinas isso é ótimo. Com milhares, o próximo passo é paginação no servidor.

## 5. Banco de dados e migrações

- `src/lib/db/schema.ts` descreve as tabelas em TypeScript. As migrações em `src/lib/db/migrations/` são o histórico de mudanças aplicadas ao banco.
- A pasta `migrations/meta/` guarda uma "foto" (*snapshot*) do schema. O `db:generate` compara o `schema.ts` com essa foto para saber **só o que mudou**. Sem ela, ele tentaria criar todas as tabelas de novo e a migração quebraria.
- Os nomes das restrições (`..._fkey`, `..._key`, `..._check`) em `schema.ts` foram escritos para bater exatamente com o banco real.
- **Nunca edite uma migração já aplicada.** Crie uma nova.

## 6. Segurança do navegador (CSP)

O `proxy.ts` envia uma *Content Security Policy*: o navegador só executa scripts do próprio site que tenham um código aleatório (*nonce*) gerado a cada resposta. Isso bloqueia scripts injetados.

O erro `eval() is not supported` acontecia porque o modo de desenvolvimento do Next.js precisa de `eval`. A regra libera `'unsafe-eval'` **só quando `NODE_ENV=development`**. Em produção continua bloqueado.

## 7. Aparência

- As cores da marca ficam em `src/app/globals.css`, no bloco `@theme`: `marca-*` (azul-petróleo) e `sol-*` (âmbar). Use classes como `bg-marca-900` e `text-sol-400` em vez de cores soltas.
- O símbolo do Solaria é um componente só (`src/components/marca.tsx`), usado na página pública, no login e no menu.
- O tema escuro hoje funciona trocando cores com regras `.tema-escuro .bg-white { ... }`. Funciona, mas cada cor nova precisa de uma regra nova. Veja `docs/PROXIMAS-MELHORIAS.md`.
- Animações usam só `transform` e `opacity` (as mais baratas para o navegador) e respeitam a opção do sistema "reduzir movimento".

## 8. Testes

- `src/__tests__/*.test.ts`. Os de integração usam um PostgreSQL de verdade (`TEST_DATABASE_URL`). Se a variável não existir, eles são **pulados** e o Vitest avisa no terminal.
- O CI (`.github/workflows/ci.yml`) roda lint, tipos, testes com PostgreSQL e build em todo Pull Request.
