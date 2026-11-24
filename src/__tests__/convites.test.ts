import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/*
 * Convites de usuários.
 * Antes: se o e-mail falhasse na criação, a conta ficava cadastrada sem convite e não havia como
 * reenviar (cadastrar de novo dava 409). Agora existe POST /api/usuarios/convite.
 */

// Serviço de e-mail simulado: guarda as mensagens e pode falhar sob comando.
const correio = vi.hoisted(() => ({
  falhar: false,
  enviados: [] as { para: string; assunto: string; texto: string; linkDesenvolvimento?: string }[],
}));
vi.mock('@/lib/email', () => ({
  enviarEmail: vi.fn(async (m: { para: string; assunto: string; texto: string; linkDesenvolvimento?: string }) => {
    if (correio.falhar) throw new Error('SMTP indisponível: auth failed for smtp-user (simulado)');
    correio.enviados.push(m);
  }),
}));

// Histórico de atividades: pode falhar sob comando, para testar a falha DEPOIS do envio.
const historico = vi.hoisted(() => ({ falhar: false }));
vi.mock('@/lib/db/atividades', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/db/atividades')>();
  return {
    ...original,
    registrar: vi.fn(async (...args: Parameters<typeof original.registrar>) => {
      if (historico.falhar) throw new Error('falha ao gravar o histórico (simulado)');
      return original.registrar(...args);
    }),
  };
});

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const ORIGEM = 'http://localhost:3000';

function consulta(caminho: string, cookie?: string) {
  return new NextRequest(`${ORIGEM}${caminho}`, { headers: cookie ? { cookie: `solaria_session=${cookie}` } : {} });
}
function requisicao(caminho: string, corpo: unknown, opcoes: { cookie?: string; origem?: string } = {}) {
  return new NextRequest(`${ORIGEM}${caminho}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Origin: opcoes.origem ?? ORIGEM,
      ...(opcoes.cookie ? { cookie: `solaria_session=${opcoes.cookie}` } : {}),
    },
    body: JSON.stringify(corpo),
  });
}
/** Token do link enviado por e-mail (só o teste o vê, porque o e-mail é simulado). */
const tokenDo = (m: { linkDesenvolvimento?: string }) => new URL(m.linkDesenvolvimento ?? '').searchParams.get('token') ?? '';

testar('Convites de usuários', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let orm: typeof import('drizzle-orm');
  let criarToken: typeof import('@/lib/sessao').criarToken;
  let redefinirSenha: typeof import('@/lib/recuperacao').redefinirSenha;
  let criar: typeof import('@/app/api/usuarios/route').POST;
  let reenviar: typeof import('@/app/api/usuarios/convite/route').POST;
  let entregaGET: typeof import('@/app/api/usuarios/convite/route').GET;
  const cookies: Record<'admin' | 'gestor' | 'consulta', string> = { admin: '', gestor: '', consulta: '' };
  const ids: string[] = [];
  let logs: string[] = [];

  const emailNovo = () => `convite-${randomBytes(6).toString('hex')}@example.test`;
  async function contasCom(email: string) {
    return (await banco.select().from(schema.usuarios).where(orm.sql`lower(${schema.usuarios.email}) = ${email.toLowerCase()}`));
  }
  async function criarConta(email: string) {
    const r = await criar(requisicao('/api/usuarios', { nome: 'Pessoa Convidada', email, papel: 'consulta' }, { cookie: cookies.admin }));
    const [u] = await contasCom(email);
    if (u) ids.push(u.id);
    return { r, u };
  }
  /** Nenhum texto de resposta ou log pode conter o token ou o link de redefinição. */
  function semSegredos(...textos: string[]) {
    for (const t of [...textos, ...logs]) {
      expect(t).not.toMatch(/redefinir-senha|token=/i);
      for (const m of correio.enviados) if (tokenDo(m)) expect(t).not.toContain(tokenDo(m));
      expect(t).not.toMatch(/smtp-user|auth failed/i); // detalhes internos do provedor de e-mail
    }
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
    ({ criarToken } = await import('@/lib/sessao'));
    ({ redefinirSenha } = await import('@/lib/recuperacao'));
    ({ POST: criar } = await import('@/app/api/usuarios/route'));
    ({ POST: reenviar, GET: entregaGET } = await import('@/app/api/usuarios/convite/route'));
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });
    for (const papel of ['admin', 'gestor', 'consulta'] as const) {
      const email = `convites-${papel}-${randomBytes(6).toString('hex')}@example.test`;
      const [u] = await banco.insert(schema.usuarios).values({ email, nome: `Equipe ${papel}`, papel, senhaHash: 'nao-usado' }).returning();
      ids.push(u.id);
      cookies[papel] = await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel });
    }
  });
  beforeEach(() => {
    // Independente do .env de quem roda: cada teste começa SEM SMTP e liga quando precisar.
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_FROM', '');
    historico.falhar = false;
    correio.falhar = false;
    correio.enviados = [];
    logs = [];
    const capturar = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
    vi.spyOn(console, 'error').mockImplementation(capturar);
    vi.spyOn(console, 'info').mockImplementation(capturar);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  afterAll(async () => {
    if (!pool) return;
    if (ids.length) {
      await banco.delete(schema.resetTokens).where(orm.inArray(schema.resetTokens.usuarioId, ids));
      await banco.delete(schema.usuarios).where(orm.inArray(schema.usuarios.id, ids));
    }
    await pool.end();
  });

  describe('1. Falha do e-mail na criação', () => {
    it('responde 503 (não finge sucesso), cria a conta uma única vez e não expõe segredos', async () => {
      const email = emailNovo();
      correio.falhar = true;
      const { r, u } = await criarConta(email);
      expect(r.status).toBe(503);
      const corpo = JSON.stringify(await r.json());
      expect(corpo).toMatch(/não foi possível enviar o convite/i);
      expect(u?.ativo).toBe(true);
      expect(await contasCom(email)).toHaveLength(1);
      semSegredos(corpo);
    });

    it('cadastrar de novo o mesmo e-mail (até com maiúsculas) dá 409 e não duplica', async () => {
      const email = emailNovo();
      correio.falhar = true;
      await criarConta(email);
      correio.falhar = false;
      const r = await criar(requisicao('/api/usuarios', { nome: 'De novo', email: email.toUpperCase(), papel: 'consulta' }, { cookie: cookies.admin }));
      expect(r.status).toBe(409);
      expect(await contasCom(email)).toHaveLength(1);
      expect(correio.enviados).toHaveLength(0);
    });
  });

  describe('2. Reenviar convite', () => {
    it('depois de uma falha, o reenvio entrega um link que funciona', async () => {
      const email = emailNovo();
      correio.falhar = true;
      const { u } = await criarConta(email);
      correio.falhar = false;
      const r = await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin }));
      expect(r.status).toBe(200);
      const corpo = JSON.stringify(await r.json());
      expect(corpo).toBe('{"ok":true,"entrega":"terminal"}'); // sem SMTP: link só no terminal
      expect(correio.enviados).toHaveLength(1);
      expect(correio.enviados[0].para).toBe(email);
      expect(correio.enviados[0].assunto).toMatch(/Convite/);
      semSegredos(corpo);
      expect(await redefinirSenha(tokenDo(correio.enviados[0]), 'SenhaDefinida#2026-convite')).toBe('ok');
      const [atividade] = await banco.select().from(schema.atividades)
        .where(orm.sql`${schema.atividades.descricao} = ${'Reenviou o convite de Pessoa Convidada'}`).limit(1);
      expect(atividade).toBeDefined();
    });

    it('só o link mais recente vale: reenviar invalida o anterior', async () => {
      const { u } = await criarConta(emailNovo());
      await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin }));
      expect(correio.enviados).toHaveLength(2); // convite da criação + reenvio
      const [daCriacao, doReenvio] = correio.enviados;
      expect(await redefinirSenha(tokenDo(daCriacao), 'SenhaDefinida#2026-antiga')).toBe('invalido');
      expect(await redefinirSenha(tokenDo(doReenvio), 'SenhaDefinida#2026-nova')).toBe('ok');
    });

    it('se o e-mail falhar de novo: 503 dizendo que NADA foi enviado, sem segredos', async () => {
      const { u } = await criarConta(emailNovo());
      correio.falhar = true;
      const r = await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin }));
      expect(r.status).toBe(503);
      const corpo = JSON.stringify(await r.json());
      expect(corpo).toMatch(/NÃO foi enviado/);
      semSegredos(corpo);
    });

    it('conta desativada não recebe link (409)', async () => {
      const { u } = await criarConta(emailNovo());
      await banco.update(schema.usuarios).set({ ativo: false }).where(orm.eq(schema.usuarios.id, u!.id));
      correio.enviados = [];
      const r = await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin }));
      expect(r.status).toBe(409);
      expect(correio.enviados).toHaveLength(0);
    });

    it('id inexistente: 404; id inválido: 422', async () => {
      const inexistente = await reenviar(requisicao('/api/usuarios/convite', { id: '00000000-0000-4000-8000-000000000000' }, { cookie: cookies.admin }));
      expect(inexistente.status).toBe(404);
      const invalido = await reenviar(requisicao('/api/usuarios/convite', { id: 'nao-e-uuid' }, { cookie: cookies.admin }));
      expect(invalido.status).toBe(422);
    });

    it('limite de envios: o 6º em 15 minutos é recusado (429) sem enviar', async () => {
      correio.falhar = true; // criação sem e-mail, para os 5 envios serem todos reenvios
      const { u } = await criarConta(emailNovo());
      correio.falhar = false;
      for (let i = 0; i < 5; i++) {
        expect((await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin }))).status).toBe(200);
      }
      const r = await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin }));
      expect(r.status).toBe(429);
      expect(correio.enviados).toHaveLength(5);
    });
  });

  describe('3. Permissões e origem preservadas', () => {
    it('gestor e consulta: 403; sem sessão: 401; nenhum e-mail sai', async () => {
      const { u } = await criarConta(emailNovo());
      correio.enviados = [];
      for (const papel of ['gestor', 'consulta'] as const) {
        expect((await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies[papel] }))).status).toBe(403);
      }
      expect((await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }))).status).toBe(401);
      expect(correio.enviados).toHaveLength(0);
    });

    it('admin vindo de outra origem (CSRF): 403 e nenhum e-mail sai', async () => {
      const { u } = await criarConta(emailNovo());
      correio.enviados = [];
      const r = await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin, origem: 'https://site-malicioso.example' }));
      expect(r.status).toBe(403);
      expect(correio.enviados).toHaveLength(0);
    });
  });

  describe('4. Modo de entrega (com e sem SMTP)', () => {
    const smtp = () => { vi.stubEnv('SMTP_HOST', '127.0.0.1'); vi.stubEnv('SMTP_FROM', 'solaria@example.test'); };

    it('GET informa "terminal" sem SMTP e "email" com SMTP, sem enviar nada', async () => {
      const semSmtp = await entregaGET(consulta('/api/usuarios/convite', cookies.admin));
      expect(await semSmtp.json()).toEqual({ entrega: 'terminal' });
      smtp();
      const comSmtp = await entregaGET(consulta('/api/usuarios/convite', cookies.admin));
      expect(await comSmtp.json()).toEqual({ entrega: 'email' });
      expect(correio.enviados).toHaveLength(0);
    });

    it('em produção é sempre "email" (sem SMTP, o envio falha com 503 em vez de ir ao terminal)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(await (await entregaGET(consulta('/api/usuarios/convite', cookies.admin))).json()).toEqual({ entrega: 'email' });
    });

    it('GET só para administradores', async () => {
      for (const papel of ['gestor', 'consulta'] as const) {
        expect((await entregaGET(consulta('/api/usuarios/convite', cookies[papel]))).status).toBe(403);
      }
      expect((await entregaGET(consulta('/api/usuarios/convite'))).status).toBe(401);
    });

    it('o reenvio informa a entrega: "email" quando há SMTP', async () => {
      const { u } = await criarConta(emailNovo());
      smtp();
      const r = await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin }));
      expect(await r.json()).toEqual({ ok: true, entrega: 'email' });
    });

    it('a regra é a mesma do email.ts real: sem SMTP só registra no terminal; com SMTP tenta enviar de verdade', async () => {
      const real = await vi.importActual<typeof import('@/lib/email')>('@/lib/email');
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      await real.enviarEmail({ para: 'x@example.test', assunto: 'teste', texto: 'teste', linkDesenvolvimento: 'http://localhost/x' });
      expect(info.mock.calls.flat().join(' ')).toMatch(/\[DEV\]/);
      expect(await (await entregaGET(consulta('/api/usuarios/convite', cookies.admin))).json()).toEqual({ entrega: 'terminal' });

      smtp();
      vi.stubEnv('SMTP_PORT', '2'); // porta fechada: prova que houve tentativa real de conexão SMTP
      await expect(real.enviarEmail({ para: 'x@example.test', assunto: 'teste', texto: 'teste' })).rejects.toThrow();
      expect(await (await entregaGET(consulta('/api/usuarios/convite', cookies.admin))).json()).toEqual({ entrega: 'email' });
    });
  });

  describe('5. Falha no histórico depois do envio', () => {
    it('o convite saiu: responde 200 (não "não enviado"), com log genérico', async () => {
      const { u } = await criarConta(emailNovo());
      correio.enviados = [];
      historico.falhar = true;
      const r = await reenviar(requisicao('/api/usuarios/convite', { id: u!.id }, { cookie: cookies.admin }));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true, entrega: 'terminal' });
      expect(correio.enviados).toHaveLength(1);
      expect(logs.join(' ')).toMatch(/não foi possível registrar no histórico/);
      semSegredos();
    });
  });
});
