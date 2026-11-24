import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/*
 * Histórico de atividades x tentativas de login (Lote 6, correção I2 da auditoria).
 * Antes: cada login errado gravava "Tentativa de entrada sem sucesso" no histórico, que guarda só
 * as 50 últimas linhas. Sem estar logado, alguém trocava de e-mail a cada tentativa (o bloqueio é
 * por e-mail) e, com 50 tentativas, apagava todas as ações legítimas da equipe.
 * Agora: login errado não escreve no histórico. A contagem de falhas continua em tentativas_login.
 * Roda só no banco de TESTE (TEST_DATABASE_URL), nunca no banco principal.
 */

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const ORIGEM = 'http://localhost:3000';
const SENHA = 'Senha-correta-123';
const LIMITE_HISTORICO = 50;

testar('Histórico de atividades protegido de logins incorretos', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let orm: typeof import('drizzle-orm');
  let registrar: typeof import('@/lib/db/atividades').registrar;
  let POST: typeof import('@/app/api/auth/login/route').POST;
  let LIMITE_POR_EMAIL: number;
  let LIMITE_POR_IP: number;
  const usuariosCriados: string[] = [];
  const emailsUsados: string[] = [];
  const ipsUsados: string[] = [];

  /** Pedido de login como o navegador faria (origem certa, JSON, IP opcional atrás de proxy). */
  function login(email: string, senha: string, ip?: string) {
    emailsUsados.push(email.toLowerCase());
    if (ip) ipsUsados.push(ip);
    return POST(new NextRequest(`${ORIGEM}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGEM, ...(ip ? { 'x-forwarded-for': ip } : {}) },
      body: JSON.stringify({ email, senha }),
    }));
  }

  const emailAleatorio = () => `historico-${randomBytes(6).toString('hex')}@example.test`;

  async function novoUsuario(ativo = true) {
    const { gerarHashSenha } = await import('@/lib/senhas');
    const email = emailAleatorio();
    const nome = `Pessoa ${randomBytes(3).toString('hex')}`;
    const [u] = await banco.insert(schema.usuarios)
      .values({ email, nome, papel: 'gestor', senhaHash: await gerarHashSenha(SENHA), ativo }).returning();
    usuariosCriados.push(u.id);
    return { email, nome };
  }

  /** Enche o histórico com 50 ações legítimas e devolve os ids, do jeito que as rotas gravam. */
  async function historicoCheio() {
    for (let i = 0; i < LIMITE_HISTORICO; i++) {
      await banco.transaction((tx) => registrar(tx, 'Equipe', `Ação legítima ${i}`));
    }
    return idsDoHistorico();
  }
  const idsDoHistorico = async () =>
    (await banco.select({ id: schema.atividades.id }).from(schema.atividades)).map((l) => l.id).sort();

  const linhasDeFalha = async () => (await banco.select().from(schema.atividades)
    .where(orm.like(schema.atividades.descricao, 'Tentativa de entrada%'))).length;

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
    ({ registrar } = await import('@/lib/db/atividades'));
    ({ POST } = await import('@/app/api/auth/login/route'));
    ({ LIMITE_POR_EMAIL, LIMITE_POR_IP } = await import('@/lib/tentativas'));
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });
  });

  beforeEach(() => {
    vi.stubEnv('TRUST_PROXY', 'false');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const chaves = [
      ...emailsUsados.map((e) => `login:email:${e}`),
      ...ipsUsados.map((ip) => `login:ip:${ip}`),
    ];
    if (chaves.length) await banco.delete(schema.tentativasLogin).where(orm.inArray(schema.tentativasLogin.chave, chaves));
    emailsUsados.length = 0;
    ipsUsados.length = 0;
  });

  afterAll(async () => {
    if (!pool) return;
    if (usuariosCriados.length) await banco.delete(schema.usuarios).where(orm.inArray(schema.usuarios.id, usuariosCriados));
    await pool.end();
  });

  describe('1. Logins incorretos não apagam nem substituem o histórico', () => {
    it('60 e-mails diferentes, sem proxy confiável: todas 401 e o histórico continua idêntico', async () => {
      const antes = await historicoCheio();
      for (let i = 0; i < 60; i++) {
        const r = await login(emailAleatorio(), 'qualquer-coisa');
        expect(r.status).toBe(401);
        expect(await r.json()).toEqual({ erro: 'E-mail ou senha incorretos' });
      }
      expect(await idsDoHistorico()).toEqual(antes);
      expect(await linhasDeFalha()).toBe(0);
    }, 120_000);

    it('senha errada de uma conta real: nada é gravado, nem depois do bloqueio (429)', async () => {
      const u = await novoUsuario();
      const antes = await historicoCheio();
      for (let i = 0; i < LIMITE_POR_EMAIL + 3; i++) await login(u.email, 'senha-errada');
      expect(await idsDoHistorico()).toEqual(antes);
      expect(await linhasDeFalha()).toBe(0);
    }, 60_000);

    it('conta desativada com a senha certa: 401 e nada é gravado', async () => {
      const u = await novoUsuario(false);
      const antes = await historicoCheio();
      const r = await login(u.email, SENHA);
      expect(r.status).toBe(401);
      expect(await idsDoHistorico()).toEqual(antes);
    });

    it('com proxy confiável e o mesmo IP: o limite por IP bloqueia e o histórico continua idêntico', async () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const ip = '203.0.113.77';
      const antes = await historicoCheio();
      const status: number[] = [];
      for (let i = 0; i < LIMITE_POR_IP + 5; i++) status.push((await login(emailAleatorio(), 'x', ip)).status);
      expect(status.slice(0, LIMITE_POR_IP)).toEqual(Array(LIMITE_POR_IP).fill(401));
      expect(status.slice(LIMITE_POR_IP)).toEqual(Array(5).fill(429));
      expect(await idsDoHistorico()).toEqual(antes);
    }, 120_000);
  });

  describe('2. Login bem-sucedido continua registrado', () => {
    it('grava "Entrou no sistema" com o nome da pessoa e mantém o limite de 50 linhas', async () => {
      const u = await novoUsuario();
      await historicoCheio();
      const r = await login(u.email, SENHA);
      expect(r.status).toBe(200);
      const [ultima] = await banco.select().from(schema.atividades)
        .orderBy(orm.desc(schema.atividades.em), orm.desc(schema.atividades.id)).limit(1);
      expect(ultima).toMatchObject({ usuario: u.nome, descricao: 'Entrou no sistema' });
      expect((await idsDoHistorico()).length).toBe(LIMITE_HISTORICO);
    });

    it('falhas antes do acerto não deixam rastro; o acerto deixa exatamente uma linha', async () => {
      const u = await novoUsuario();
      await historicoCheio();
      for (let i = 0; i < LIMITE_POR_EMAIL - 1; i++) expect((await login(u.email, 'senha-errada')).status).toBe(401);
      expect((await login(u.email, SENHA)).status).toBe(200);
      const linhas = await banco.select().from(schema.atividades).where(orm.eq(schema.atividades.usuario, u.nome));
      expect(linhas.map((l) => l.descricao)).toEqual(['Entrou no sistema']);
      expect(await linhasDeFalha()).toBe(0);
    }, 60_000);
  });

  describe('3. Limites de tentativas do Lote 2 continuam iguais', () => {
    it('por e-mail: 5 erros bloqueiam a conta, inclusive para a senha certa', async () => {
      const u = await novoUsuario();
      for (let i = 0; i < LIMITE_POR_EMAIL; i++) expect((await login(u.email, 'senha-errada')).status).toBe(401);
      const r = await login(u.email, SENHA);
      expect(r.status).toBe(429);
      expect((await r.json()).erro).toMatch(/^Muitas tentativas\. Tente novamente em \d+s\.$/);
    }, 60_000);

    it('a contagem das falhas continua sendo gravada em tentativas_login', async () => {
      const u = await novoUsuario();
      await login(u.email, 'senha-errada');
      await login(u.email, 'senha-errada');
      const [linha] = await banco.select().from(schema.tentativasLogin)
        .where(orm.eq(schema.tentativasLogin.chave, `login:email:${u.email}`));
      expect(linha.contagem).toBe(2);
    });

    it('acerto zera a contagem do e-mail, como antes', async () => {
      const u = await novoUsuario();
      await login(u.email, 'senha-errada');
      expect((await login(u.email, SENHA)).status).toBe(200);
      const linhas = await banco.select().from(schema.tentativasLogin)
        .where(orm.eq(schema.tentativasLogin.chave, `login:email:${u.email}`));
      expect(linhas).toHaveLength(0);
    });
  });
});
