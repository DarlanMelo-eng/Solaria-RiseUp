import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/*
 * Bloqueio coletivo de autenticação.
 * Antes: sem IP confiável, todo mundo dividia a chave "…:ip:desconhecido"; 5 erros de qualquer
 * pessoa bloqueavam login, recuperação e troca de senha de TODOS os usuários.
 * Agora: sem IP confiável conta só o e-mail; com IP confiável, o IP tem limite próprio e maior.
 */

vi.mock('@/lib/email', () => ({ enviarEmail: vi.fn(async () => undefined) }));

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const ORIGEM = 'http://localhost:3000';
const SENHA = 'SenhaCorreta#2026-teste';
const ERRADA = 'SenhaErrada#2026-teste';
const CHAVES_COMPARTILHADAS = ['login:ip:desconhecido', 'reset:ip:desconhecido', 'login:ip:troca:desconhecido'];

const aleatorio = () => randomBytes(6).toString('hex');
const emailFicticio = () => `ninguem-${aleatorio()}@example.test`;
const ipDeTeste = () => `2001:db8::${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}`;

function post(caminho: string, corpo: unknown, opcoes: { cookie?: string; ip?: string } = {}) {
  return new NextRequest(`${ORIGEM}${caminho}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Origin: ORIGEM,
      ...(opcoes.cookie ? { cookie: `solaria_session=${opcoes.cookie}` } : {}),
      ...(opcoes.ip ? { 'x-forwarded-for': opcoes.ip } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

testar('Tentativas de autenticação: sem bloqueio coletivo', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let orm: typeof import('drizzle-orm');
  let tentativas: typeof import('@/lib/tentativas');
  let criarToken: typeof import('@/lib/sessao').criarToken;
  let login: typeof import('@/app/api/auth/login/route').POST;
  let esqueci: typeof import('@/app/api/auth/esqueci-senha/route').POST;
  let alterar: typeof import('@/app/api/auth/alterar-senha/route').POST;
  let hash = '';
  const ids: string[] = [];

  async function novoUsuario() {
    const email = `tentativa-${aleatorio()}@example.test`;
    const [u] = await banco.insert(schema.usuarios).values({ email, nome: 'Teste tentativas', papel: 'gestor', senhaHash: hash }).returning();
    ids.push(u.id);
    return { id: u.id, email, cookie: await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel: 'gestor' }) };
  }
  const entrar = (email: string, senha: string, ip?: string) => login(post('/api/auth/login', { email, senha }, { ip }));
  const pedirRecuperacao = (email: string, ip?: string) => esqueci(post('/api/auth/esqueci-senha', { email }, { ip }));
  const trocarSenha = (cookie: string, senhaAtual: string, novaSenha: string) =>
    alterar(post('/api/auth/alterar-senha', { senhaAtual, novaSenha, confirmacao: novaSenha }, { cookie }));
  async function tokensAbertos(usuarioId: string) {
    const { and, eq, isNull } = orm;
    const linhas = await banco.select().from(schema.resetTokens)
      .where(and(eq(schema.resetTokens.usuarioId, usuarioId), isNull(schema.resetTokens.usadoEm)));
    return linhas.length;
  }
  async function chavesExistentes(chaves: string[]) {
    const linhas = await banco.select().from(schema.tentativasLogin).where(orm.inArray(schema.tentativasLogin.chave, chaves));
    return linhas.map((l) => l.chave);
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
    schema = await import('@/lib/db/schema');
    orm = await import('drizzle-orm');
    tentativas = await import('@/lib/tentativas');
    ({ criarToken } = await import('@/lib/sessao'));
    ({ POST: login } = await import('@/app/api/auth/login/route'));
    ({ POST: esqueci } = await import('@/app/api/auth/esqueci-senha/route'));
    ({ POST: alterar } = await import('@/app/api/auth/alterar-senha/route'));
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });
    hash = await (await import('@/lib/senhas')).gerarHashSenha(SENHA);
    // Restos de versões antigas não podem mascarar o teste.
    await banco.delete(schema.tentativasLogin).where(orm.inArray(schema.tentativasLogin.chave, CHAVES_COMPARTILHADAS));
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    if (!pool) return;
    if (ids.length) {
      await banco.delete(schema.resetTokens).where(orm.inArray(schema.resetTokens.usuarioId, ids));
      await banco.delete(schema.usuarios).where(orm.inArray(schema.usuarios.id, ids));
    }
    await pool.end();
  });

  describe('1. Chaves geradas', () => {
    it('sem IP confiável: só a chave do e-mail (inclusive na troca de senha)', () => {
      expect(tentativas.chavesTentativa('login', 'Ana@Example.test', 'desconhecido')).toEqual(['login:email:ana@example.test']);
      expect(tentativas.chavesTentativa('reset', 'ana@example.test', 'desconhecido')).toEqual(['reset:email:ana@example.test']);
      expect(tentativas.chavesTentativa('login', 'troca:ana@example.test', 'troca:desconhecido')).toEqual(['login:email:troca:ana@example.test']);
    });

    it('com IP confiável: e-mail primeiro, IP depois, e o prefixo "troca:" continua isolado', () => {
      expect(tentativas.chavesTentativa('login', 'ana@example.test', '2001:db8::1'))
        .toEqual(['login:email:ana@example.test', 'login:ip:2001:db8::1']);
      expect(tentativas.chavesTentativa('login', 'troca:ana@example.test', 'troca:203.0.113.7'))
        .toEqual(['login:email:troca:ana@example.test', 'login:ip:troca:203.0.113.7']);
    });

    it('o limite por IP é maior que o limite por e-mail', () => {
      expect(tentativas.LIMITE_POR_EMAIL).toBe(5);
      expect(tentativas.LIMITE_POR_IP).toBeGreaterThan(tentativas.LIMITE_POR_EMAIL);
    });
  });

  describe('2. Login sem IP confiável (TRUST_PROXY desligado)', () => {
    it('erros de outras pessoas NÃO bloqueiam quem digita a senha certa', async () => {
      for (let i = 0; i < 6; i++) expect((await entrar(emailFicticio(), ERRADA)).status).toBe(401);
      const u = await novoUsuario();
      expect((await entrar(u.email, SENHA)).status).toBe(200);
      expect(await chavesExistentes(CHAVES_COMPARTILHADAS)).toEqual([]);
    });

    it('o bloqueio individual continua: 5 erros na mesma conta bloqueiam só essa conta', async () => {
      const alvo = await novoUsuario();
      const outro = await novoUsuario();
      for (let i = 0; i < 5; i++) expect((await entrar(alvo.email, ERRADA)).status).toBe(401);
      const bloqueado = await entrar(alvo.email, SENHA);
      expect(bloqueado.status).toBe(429);
      expect((await bloqueado.json()).erro).toMatch(/Muitas tentativas/);
      expect((await entrar(outro.email, SENHA)).status).toBe(200);
    });
  });

  describe('3. Login com IP confiável (TRUST_PROXY=true)', () => {
    it(`o IP só bloqueia ao atingir o próprio limite, e só aquele IP`, async () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const ip = ipDeTeste();
      const limite = tentativas.LIMITE_POR_IP;
      for (let i = 0; i < limite - 1; i++) expect((await entrar(emailFicticio(), ERRADA, ip)).status).toBe(401);

      const colega = await novoUsuario(); // mesma rede (mesmo IP público), ainda abaixo do limite do IP
      expect((await entrar(colega.email, SENHA, ip)).status).toBe(200);

      expect((await entrar(emailFicticio(), ERRADA, ip)).status).toBe(401); // atinge o limite do IP
      const outro = await novoUsuario();
      expect((await entrar(outro.email, SENHA, ip)).status).toBe(429);
      expect((await entrar(outro.email, SENHA, ipDeTeste())).status).toBe(200);
    });
  });

  describe('4. Recuperação de senha sem IP confiável', () => {
    it('pedidos de outras pessoas não impedem o envio para quem pede; resposta sempre igual', async () => {
      const respostas: string[] = [];
      for (let i = 0; i < 5; i++) respostas.push(JSON.stringify(await (await pedirRecuperacao(emailFicticio())).json()));
      const u = await novoUsuario();
      const r = await pedirRecuperacao(u.email);
      expect(r.status).toBe(200);
      respostas.push(JSON.stringify(await r.json()));
      expect(new Set(respostas).size).toBe(1);
      expect(await tokensAbertos(u.id)).toBe(1);
      expect(await chavesExistentes(['reset:ip:desconhecido'])).toEqual([]);
    });

    it('o limite por e-mail continua: depois de 5 pedidos, a mesma conta não recebe novo link', async () => {
      const u = await novoUsuario();
      const { eq } = orm;
      const total = async () => (await banco.select().from(schema.resetTokens).where(eq(schema.resetTokens.usuarioId, u.id))).length;
      for (let i = 0; i < 5; i++) await pedirRecuperacao(u.email);
      expect(await total()).toBe(5);
      const r = await pedirRecuperacao(u.email);
      expect(r.status).toBe(200); // resposta genérica, sem revelar o bloqueio
      expect(await total()).toBe(5);
    });
  });

  describe('5. Troca de senha sem IP confiável', () => {
    it('erros de uma pessoa não bloqueiam a troca de outra, nem o login de ninguém', async () => {
      const errou = await novoUsuario();
      const outra = await novoUsuario();
      for (let i = 0; i < 5; i++) expect((await trocarSenha(errou.cookie, ERRADA, 'NovaSenha#2026-abc')).status).toBe(422);
      expect((await trocarSenha(errou.cookie, SENHA, 'NovaSenha#2026-abc')).status).toBe(429);
      // Contadores isolados: a troca bloqueada não afeta o login da mesma pessoa.
      expect((await entrar(errou.email, SENHA)).status).toBe(200);
      expect((await trocarSenha(outra.cookie, SENHA, 'NovaSenha#2026-xyz')).status).toBe(200);
      expect(await chavesExistentes(['login:ip:troca:desconhecido'])).toEqual([]);
    });
  });
});
