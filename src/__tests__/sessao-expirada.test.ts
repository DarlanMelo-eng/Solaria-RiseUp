import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/*
 * Laço de redirecionamento com sessão revogada:
 * proxy (/login → /dashboard, só confere assinatura) × layout (/dashboard → /login, confere o banco).
 * Correção: o layout manda para /sessao-expirada, que apaga o cookie e leva ao login.
 */

// Permite simular o PostgreSQL fora do ar só na conferência da sessão.
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

function requisicao(caminho: string, cookie?: string) {
  return new NextRequest(`${ORIGEM}${caminho}`, { headers: cookie ? { cookie: `solaria_session=${cookie}` } : {} });
}
/** NextResponse.next() do proxy: deixa a página abrir, sem redirecionar. */
const deixouPassar = (r: Response) => r.headers.get('x-middleware-next') === '1' && !r.headers.get('location');

testar('Sessão revogada: sem laço de redirecionamento', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let usuarios: typeof import('@/lib/db/schema').usuarios;
  let criarToken: typeof import('@/lib/sessao').criarToken;
  let GET: typeof import('@/app/sessao-expirada/route').GET;
  let proxy: typeof import('@/proxy').proxy;
  let eq: typeof import('drizzle-orm').eq;
  const ids: string[] = [];

  /** Cria um usuário e devolve o id e um cookie válido para ele. */
  async function novoUsuario(): Promise<{ id: string; cookie: string }> {
    const email = `sessao-${randomBytes(6).toString('hex')}@example.test`;
    const [u] = await banco.insert(usuarios).values({
      email, nome: 'Teste sessão', papel: 'gestor', senhaHash: 'nao-usado-neste-teste',
    }).returning();
    ids.push(u.id);
    return { id: u.id, cookie: await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel: 'gestor' }) };
  }
  /** Simula "senha trocada em outro aparelho": todo cookie anterior deixa de valer. */
  async function revogar(id: string) {
    const { sql } = await import('drizzle-orm');
    await banco.update(usuarios).set({ versaoToken: sql`${usuarios.versaoToken} + 1` }).where(eq(usuarios.id, id));
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL deve apontar para banco isolado de DATABASE_URL.');
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SSL = 'false';
    process.env.SESSION_SECRET = randomBytes(32).toString('base64');
    ({ pool, banco } = await import('@/lib/db'));
    ({ usuarios } = await import('@/lib/db/schema'));
    ({ criarToken } = await import('@/lib/sessao'));
    ({ GET } = await import('@/app/sessao-expirada/route'));
    ({ proxy } = await import('@/proxy'));
    ({ eq } = await import('drizzle-orm'));
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
    const { inArray } = await import('drizzle-orm');
    if (ids.length) await banco.delete(usuarios).where(inArray(usuarios.id, ids));
    await pool.end();
  });

  describe('1. Rota com sessão inválida: leva ao login e apaga o cookie', () => {
    it('conta desativada pelo administrador', async () => {
      const u = await novoUsuario();
      await banco.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, u.id));
      const r = await GET(requisicao('/sessao-expirada', u.cookie));
      expect(r.status).toBe(307);
      expect(r.headers.get('location')).toBe(`${ORIGEM}/login`);
      expect(r.headers.get('set-cookie')).toMatch(/^solaria_session=;/);
    });

    it('senha trocada em outro aparelho (versão do token mudou)', async () => {
      const u = await novoUsuario();
      await revogar(u.id);
      const r = await GET(requisicao('/sessao-expirada', u.cookie));
      expect(r.headers.get('location')).toBe(`${ORIGEM}/login`);
      expect(r.headers.get('set-cookie')).toMatch(/^solaria_session=;/);
    });

    it('cookie expirado', async () => {
      const u = await novoUsuario();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() - 9 * 60 * 60 * 1000); // a sessão dura 8 h
      const expirado = await criarToken({ sub: u.id, v: 0, email: 'x@example.test', nome: 'X', papel: 'gestor' });
      vi.useRealTimers();
      const r = await GET(requisicao('/sessao-expirada', expirado));
      expect(r.headers.get('location')).toBe(`${ORIGEM}/login`);
      expect(r.headers.get('set-cookie')).toMatch(/^solaria_session=;/);
    });

    it('cookie adulterado ou malformado: sem erro 500', async () => {
      const a = await novoUsuario();
      const b = await novoUsuario();
      const adulterado = `${a.cookie.split('.')[0]}.${b.cookie.split('.')[1]}`; // dados de A com a assinatura de B
      for (const cookie of [adulterado, 'lixo-sem-ponto']) {
        const r = await GET(requisicao('/sessao-expirada', cookie));
        expect(r.status, cookie).toBe(307);
        expect(r.headers.get('location'), cookie).toBe(`${ORIGEM}/login`);
        expect(r.headers.get('set-cookie'), cookie).toMatch(/^solaria_session=;/);
      }
    });

    it('cookie que nem pode ser decodificado (%%%) é ignorado pelo Next: login abre, sem laço', async () => {
      // O Next descarta valores com "%" inválido: para proxy, layout e rota é como não ter cookie.
      // Por isso não há Set-Cookie, e também não há risco: nada o aceita como sessão.
      const r = await GET(requisicao('/sessao-expirada', '%%%.@@@'));
      expect(r.status).toBe(307);
      expect(r.headers.get('location')).toBe(`${ORIGEM}/login`);
      expect(deixouPassar(await proxy(requisicao('/login', '%%%.@@@')))).toBe(true);
    });

    it('sem cookie: vai ao login sem enviar Set-Cookie', async () => {
      const r = await GET(requisicao('/sessao-expirada'));
      expect(r.headers.get('location')).toBe(`${ORIGEM}/login`);
      expect(r.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('2. Limpeza do cookie com os mesmos atributos do login', () => {
    it('apaga com Path=/, Max-Age=0, HttpOnly, SameSite=lax e sem cache', async () => {
      const u = await novoUsuario();
      await revogar(u.id);
      const r = await GET(requisicao('/sessao-expirada', u.cookie));
      const cookie = r.headers.get('set-cookie') ?? '';
      expect(cookie).toMatch(/^solaria_session=;/);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).toMatch(/Max-Age=0/i);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).not.toMatch(/Secure/i);
      expect(r.headers.get('cache-control')).toBe('no-store');
    });

    it('em produção também marca Secure, como o cookie do login', async () => {
      const u = await novoUsuario();
      await revogar(u.id);
      vi.stubEnv('NODE_ENV', 'production');
      const r = await GET(requisicao('/sessao-expirada', u.cookie));
      expect(r.headers.get('set-cookie')).toMatch(/Secure/i);
    });
  });

  describe('3. Segurança da rota', () => {
    it('sessão válida: vai ao dashboard e NÃO apaga o cookie (link malicioso não desloga)', async () => {
      const u = await novoUsuario();
      const r = await GET(requisicao('/sessao-expirada', u.cookie));
      expect(r.status).toBe(307);
      expect(r.headers.get('location')).toBe(`${ORIGEM}/dashboard`);
      expect(r.headers.get('set-cookie')).toBeNull();
    });

    it('ignora ?next= externo: destino sempre no próprio site', async () => {
      const u = await novoUsuario();
      await revogar(u.id);
      const r = await GET(requisicao('/sessao-expirada?next=https://site-externo.example/roubo', u.cookie));
      expect(r.headers.get('location')).toBe(`${ORIGEM}/login`);
    });

    it('banco fora do ar: falha sem apagar a sessão', async () => {
      const u = await novoUsuario();
      controle.falharBanco = true;
      // Lançar o erro é o comportamento esperado: o Next mostra "Algo deu errado" e nenhum Set-Cookie sai.
      await expect(GET(requisicao('/sessao-expirada', u.cookie))).rejects.toThrow('PostgreSQL indisponível');
    });
  });

  describe('4. Proxy sem regressão e fim do laço', () => {
    it('cadeia completa termina no login em até 3 passos, sem repetir endereço', async () => {
      const u = await novoUsuario();
      await revogar(u.id);
      const visitados: string[] = [];

      // Passo 1: o proxy ainda manda /login para /dashboard (só confere a assinatura).
      const p1 = await proxy(requisicao('/login', u.cookie));
      visitados.push('/login');
      expect(new URL(p1.headers.get('location') ?? '').pathname).toBe('/dashboard');

      // Passo 2: no /dashboard, o layout vê que o banco recusou e manda para /sessao-expirada.
      // (O layout lê cookies() e não é chamado direto aqui; conferimos a mesma decisão.)
      visitados.push('/dashboard');
      const { verificarUsuarioSessao } = await import('@/lib/usuarios');
      const { lerSessao } = await import('@/lib/sessao');
      expect(await verificarUsuarioSessao((await lerSessao(u.cookie))!)).toBeNull();
      expect(deixouPassar(await proxy(requisicao('/sessao-expirada', u.cookie)))).toBe(true);

      // Passo 3: a rota apaga o cookie e manda ao login.
      const r = await GET(requisicao('/sessao-expirada', u.cookie));
      visitados.push('/sessao-expirada');
      expect(r.headers.get('set-cookie')).toMatch(/^solaria_session=;/);
      expect(new URL(r.headers.get('location') ?? '').pathname).toBe('/login');

      // Fim: sem cookie, o proxy mostra a tela de login em vez de redirecionar de novo.
      expect(deixouPassar(await proxy(requisicao('/login')))).toBe(true);
      expect(visitados.length).toBeLessThanOrEqual(3);
      expect(new Set(visitados).size).toBe(visitados.length);
    });

    it('/login com cookie expirado, adulterado ou malformado abre a tela de login', async () => {
      const u = await novoUsuario();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() - 9 * 60 * 60 * 1000);
      const expirado = await criarToken({ sub: u.id, v: 0, email: 'x@example.test', nome: 'X', papel: 'gestor' });
      vi.useRealTimers();
      const adulterado = `${u.cookie.split('.')[0]}.${expirado.split('.')[1]}`;
      for (const cookie of [expirado, adulterado, 'lixo-sem-ponto']) {
        expect(deixouPassar(await proxy(requisicao('/login', cookie))), cookie).toBe(true);
      }
    });

    it('/login?next= com sessão válida continua indo ao dashboard do próprio site', async () => {
      const u = await novoUsuario();
      for (const next of ['/usinas', 'https://site-externo.example']) {
        const r = await proxy(requisicao(`/login?next=${encodeURIComponent(next)}`, u.cookie));
        expect(r.headers.get('location')).toBe(`${ORIGEM}/dashboard`);
      }
    });

    it('recuperação de senha continua pública, com ou sem cookie', async () => {
      const valido = await novoUsuario();
      const revogado = await novoUsuario();
      await revogar(revogado.id);
      for (const caminho of ['/esqueci-senha', '/redefinir-senha?token=abc']) {
        for (const cookie of [undefined, valido.cookie, revogado.cookie]) {
          expect(deixouPassar(await proxy(requisicao(caminho, cookie))), `${caminho} ${cookie ? 'com' : 'sem'} cookie`).toBe(true);
        }
      }
    });
  });
});
