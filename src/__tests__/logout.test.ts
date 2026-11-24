import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/*
 * Logout.
 * Antes: a rota exigia sessão válida no banco. Com sessão revogada respondia 401 e o cookie ficava;
 * e a interface ignorava qualquer erro e "fingia" ter saído.
 * Agora: a rota só confere a origem (CSRF) e sempre apaga o cookie, sem depender do banco.
 * A parte da interface (falha de rede) não tem teste automatizado: o projeto não tem jsdom nem
 * Testing Library, e não adicionamos dependências. Ver o teste manual no LEIA-ME do lote.
 */

// Permite simular o PostgreSQL fora do ar na conferência de sessão.
const controle = vi.hoisted(() => ({ falharBanco: false }));
vi.mock('@/lib/usuarios', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/usuarios')>();
  return {
    ...original,
    verificarUsuarioSessao: vi.fn(async (sessao: Parameters<typeof original.verificarUsuarioSessao>[0]) => {
      if (controle.falharBanco) throw new Error('PostgreSQL indisponível (simulado)');
      return original.verificarUsuarioSessao(sessao);
    }),
  };
});

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const ORIGEM = 'http://localhost:3000';

function requisicao(caminho: string, opcoes: { metodo?: string; cookie?: string; origem?: string | null; json?: boolean } = {}) {
  const { metodo = 'GET', cookie, origem = ORIGEM, json = true } = opcoes;
  return new NextRequest(`${ORIGEM}${caminho}`, {
    method: metodo,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/x-www-form-urlencoded' }),
      ...(origem ? { Origin: origem } : {}),
      ...(cookie ? { cookie: `solaria_session=${cookie}` } : {}),
    },
  });
}
const sair = (opcoes: Parameters<typeof requisicao>[1] = {}) => requisicao('/api/auth/logout', { metodo: 'POST', ...opcoes });
/** Confere que a resposta apaga o cookie com os mesmos atributos do login. */
function esperaCookieApagado(r: Response) {
  const c = r.headers.get('set-cookie') ?? '';
  expect(c).toMatch(/^solaria_session=;/);
  expect(c).toMatch(/Path=\//);
  expect(c).toMatch(/Max-Age=0/i);
  expect(c).toMatch(/HttpOnly/i);
  expect(c).toMatch(/SameSite=lax/i);
}

testar('Logout', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let usuarios: typeof import('@/lib/db/schema').usuarios;
  let orm: typeof import('drizzle-orm');
  let criarToken: typeof import('@/lib/sessao').criarToken;
  let lerSessao: typeof import('@/lib/sessao').lerSessao;
  let verificar: typeof import('@/lib/usuarios').verificarUsuarioSessao;
  let POST: typeof import('@/app/api/auth/logout/route').POST;
  let proxy: typeof import('@/proxy').proxy;
  const ids: string[] = [];

  async function novoUsuario() {
    const email = `logout-${randomBytes(6).toString('hex')}@example.test`;
    const [u] = await banco.insert(usuarios).values({ email, nome: 'Teste logout', papel: 'gestor', senhaHash: 'nao-usado-neste-teste' }).returning();
    ids.push(u.id);
    return { id: u.id, cookie: await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel: 'gestor' }) };
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL deve apontar para banco isolado de DATABASE_URL.');
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SSL = 'false';
    process.env.APP_URL = ORIGEM;
    process.env.SESSION_SECRET = randomBytes(32).toString('base64');
    ({ pool, banco } = await import('@/lib/db'));
    ({ usuarios } = await import('@/lib/db/schema'));
    orm = await import('drizzle-orm');
    ({ criarToken, lerSessao } = await import('@/lib/sessao'));
    ({ verificarUsuarioSessao: verificar } = await import('@/lib/usuarios'));
    ({ POST } = await import('@/app/api/auth/logout/route'));
    ({ proxy } = await import('@/proxy'));
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });
  });
  afterEach(() => {
    controle.falharBanco = false;
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  afterAll(async () => {
    if (!pool) return;
    if (ids.length) await banco.delete(usuarios).where(orm.inArray(usuarios.id, ids));
    await pool.end();
  });

  describe('1. A rota sempre apaga o cookie', () => {
    it('sessão válida: 200, cookie apagado com os atributos corretos e sem cache', async () => {
      const u = await novoUsuario();
      const r = await POST(sair({ cookie: u.cookie }));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true });
      esperaCookieApagado(r);
      expect(r.headers.get('set-cookie')).not.toMatch(/Secure/i);
      expect(r.headers.get('cache-control')).toBe('no-store');
    });

    it('em produção o cookie apagado também é Secure, como o do login', async () => {
      const u = await novoUsuario();
      vi.stubEnv('NODE_ENV', 'production');
      expect((await POST(sair({ cookie: u.cookie }))).headers.get('set-cookie')).toMatch(/Secure/i);
    });

    it('sessão revogada (senha trocada em outro aparelho): 200 e cookie apagado (antes: 401)', async () => {
      const u = await novoUsuario();
      await banco.update(usuarios).set({ versaoToken: orm.sql`${usuarios.versaoToken} + 1` }).where(orm.eq(usuarios.id, u.id));
      const r = await POST(sair({ cookie: u.cookie }));
      expect(r.status).toBe(200);
      esperaCookieApagado(r);
    });

    it('conta desativada pelo administrador: 200 e cookie apagado', async () => {
      const u = await novoUsuario();
      await banco.update(usuarios).set({ ativo: false }).where(orm.eq(usuarios.id, u.id));
      const r = await POST(sair({ cookie: u.cookie }));
      expect(r.status).toBe(200);
      esperaCookieApagado(r);
    });

    it('cookie expirado, adulterado ou malformado: 200 e cookie apagado', async () => {
      const a = await novoUsuario();
      const b = await novoUsuario();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() - 9 * 60 * 60 * 1000); // a sessão dura 8 h
      const expirado = await criarToken({ sub: a.id, v: 0, email: 'x@example.test', nome: 'X', papel: 'gestor' });
      vi.useRealTimers();
      const adulterado = `${a.cookie.split('.')[0]}.${b.cookie.split('.')[1]}`;
      for (const cookie of [expirado, adulterado, 'lixo-sem-ponto']) {
        const r = await POST(sair({ cookie }));
        expect(r.status, cookie).toBe(200);
        esperaCookieApagado(r);
      }
    });

    it('sem cookie: 200 (já está fora; apagar de novo é inofensivo)', async () => {
      const r = await POST(sair());
      expect(r.status).toBe(200);
      esperaCookieApagado(r);
    });

    it('não depende do banco: funciona mesmo com o PostgreSQL fora do ar', async () => {
      const u = await novoUsuario();
      controle.falharBanco = true;
      const r = await POST(sair({ cookie: u.cookie }));
      expect(r.status).toBe(200);
      esperaCookieApagado(r);
    });
  });

  describe('2. Proteção contra outras origens (CSRF) continua', () => {
    it('origem externa: 403 e o cookie NÃO é apagado', async () => {
      const u = await novoUsuario();
      const r = await POST(sair({ cookie: u.cookie, origem: 'https://site-malicioso.example' }));
      expect(r.status).toBe(403);
      expect(r.headers.get('set-cookie')).toBeNull();
    });

    it('formulário de outro site (sem Origin e sem JSON): 403 e o cookie NÃO é apagado', async () => {
      const u = await novoUsuario();
      const r = await POST(sair({ cookie: u.cookie, origem: null, json: false }));
      expect(r.status).toBe(403);
      expect(r.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('3. Depois do logout: sem acesso a dados privados e sem laço', () => {
    it('sem cookie, páginas protegidas levam ao login e a API responde 401', async () => {
      const dashboard = await proxy(requisicao('/dashboard'));
      expect(dashboard.status).toBe(307);
      expect(new URL(dashboard.headers.get('location') ?? '').pathname).toBe('/login');
      expect((await proxy(requisicao('/api/dados'))).status).toBe(401);
    });

    it('a tela de login abre direto, sem redirecionar de novo', async () => {
      const r = await proxy(requisicao('/login'));
      expect(r.headers.get('x-middleware-next')).toBe('1');
      expect(r.headers.get('location')).toBeNull();
    });

    it('sem sessão válida, o proxy responde 401 ao logout: a interface trata isso como "já saiu"', async () => {
      // Documenta o motivo de a interface aceitar 401 como sucesso: a rota nem chega a rodar.
      expect((await proxy(sair())).status).toBe(401);
      expect((await proxy(sair({ cookie: 'lixo-sem-ponto' }))).status).toBe(401);
    });

    it('sair num navegador não derruba a mesma conta em outro aparelho', async () => {
      const u = await novoUsuario();
      const outroAparelho = await criarToken({ ...(await lerSessao(u.cookie))!, v: 0 });
      await POST(sair({ cookie: u.cookie }));
      expect(await verificar((await lerSessao(outroAparelho))!)).not.toBeNull();
    });
  });
});
