import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Papel } from '@/types/solar';

vi.mock('@/lib/email', () => ({ enviarEmail: vi.fn(async () => undefined) }));
const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;

function requisicao(caminho: string, metodo: string, cookie?: string, corpo?: unknown) {
  return new NextRequest(`http://localhost:3000${caminho}`, {
    method: metodo,
    headers: { ...(cookie ? { cookie: `solaria_session=${cookie}` } : {}),
      'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
}

testar('PostgreSQL: autenticação, tokens, permissões e rate limit', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let usuarios: typeof import('@/lib/db/schema').usuarios;
  let resetTokens: typeof import('@/lib/db/schema').resetTokens;
  let criarToken: typeof import('@/lib/sessao').criarToken;
  let emitirToken: typeof import('@/lib/recuperacao').emitirToken;
  let redefinirSenha: typeof import('@/lib/recuperacao').redefinirSenha;
  let chavesTentativa: typeof import('@/lib/tentativas').chavesTentativa;
  let segundosBloqueado: typeof import('@/lib/tentativas').segundosBloqueado;
  let registrarFalhas: typeof import('@/lib/tentativas').registrarFalhas;
  const ids: Partial<Record<Papel, string>> = {};
  const cookies: Partial<Record<Papel, string>> = {};
  const emails: Partial<Record<Papel, string>> = {};
  // Usuário exclusivo dos testes de recuperação: redefinir a senha revoga a sessão dele,
  // então ele não pode ser compartilhado com os testes de permissão.
  let recuperacao: { id: string; cookie: string } | undefined;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL deve apontar para banco isolado de DATABASE_URL.');
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SSL = 'false';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.SESSION_SECRET = randomBytes(32).toString('base64');
    ({ pool, banco } = await import('@/lib/db'));
    ({ usuarios, resetTokens } = await import('@/lib/db/schema'));
    ({ criarToken } = await import('@/lib/sessao'));
    ({ emitirToken, redefinirSenha } = await import('@/lib/recuperacao'));
    ({ chavesTentativa, segundosBloqueado, registrarFalhas } = await import('@/lib/tentativas'));
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });
    const { gerarHashSenha } = await import('@/lib/senhas');
    const hash = await gerarHashSenha('SenhaOriginalSegura#123');
    for (const papel of ['admin', 'gestor', 'consulta'] as const) {
      const email = `${papel}-${randomBytes(6).toString('hex')}@example.test`;
      const [u] = await banco.insert(usuarios).values({ email, nome: `Teste ${papel}`, papel, senhaHash: hash }).returning();
      ids[papel] = u.id;
      emails[papel] = email;
      cookies[papel] = await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel });
    }
    const emailRec = `recuperacao-${randomBytes(6).toString('hex')}@example.test`;
    const [ur] = await banco.insert(usuarios).values({ email: emailRec, nome: 'Teste recuperação', papel: 'gestor', senhaHash: hash }).returning();
    recuperacao = { id: ur.id, cookie: await criarToken({ sub: ur.id, v: ur.versaoToken, email: emailRec, nome: ur.nome, papel: 'gestor' }) };
  });
  afterAll(async () => { if (pool) await pool.end(); });

  it('tokens de recuperação: válido, reutilizado, expirado, inexistente', async () => {
    const link = await emitirToken(recuperacao!.id);
    const token = new URL(link).searchParams.get('token')!;
    expect(await redefinirSenha(token, 'Senhaforte#um123')).toBe('ok');
    expect(await redefinirSenha(token, 'SenhaForte#outra123')).toBe('invalido');
    const link2 = await emitirToken(recuperacao!.id);
    const token2 = new URL(link2).searchParams.get('token')!;
    const { eq } = await import('drizzle-orm');
    const { hashToken } = await import('@/lib/recuperacao');
    await banco.update(resetTokens).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(resetTokens.tokenHash, hashToken(token2)));
    expect(await redefinirSenha(token2, 'Senhaforte#tres123')).toBe('invalido');
    expect(await redefinirSenha(randomBytes(32).toString('base64url'), 'Senhaforte#quatro123')).toBe('invalido');
  });

  it('redefinição de senha revoga cookie anterior', async () => {
    const { verificarUsuarioSessao } = await import('@/lib/usuarios');
    const { lerSessao } = await import('@/lib/sessao');
    const sessao = await lerSessao(recuperacao!.cookie);
    expect(sessao).not.toBeNull();
    expect(await verificarUsuarioSessao(sessao!)).toBeNull();
  });

  it('limite persistente: a sexta tentativa é bloqueada', async () => {
    const chaves = chavesTentativa('login', `rate-${randomBytes(6).toString('hex')}@example.test`, `2001:db8::${randomBytes(4).toString('hex')}`);
    for (let i = 0; i < 4; i++) {
      await registrarFalhas(chaves);
      expect(await segundosBloqueado(chaves)).toBe(0);
    }
    await registrarFalhas(chaves);
    expect(await segundosBloqueado(chaves)).toBeGreaterThan(0);
  });

  it('resposta idêntica para e-mail existente/inexistente', async () => {
    const { POST } = await import('@/app/api/auth/esqueci-senha/route');
    const resposta1 = await POST(requisicao('/api/auth/esqueci-senha', 'POST', undefined, { email: emails.admin }));
    const resposta2 = await POST(requisicao('/api/auth/esqueci-senha', 'POST', undefined, { email: `ausente-${randomBytes(6).toString('hex')}@example.test` }));
    expect(resposta1.status).toBe(200);
    expect(resposta2.status).toBe(200);
    expect(await resposta1.json()).toEqual(await resposta2.json());
  });

  it('protege PATCH e DELETE em cada rota de recurso', async () => {
    const u = await import('@/app/api/usinas/[id]/route');
    const l = await import('@/app/api/licencas/[id]/route');
    const m = await import('@/app/api/manutencoes/[id]/route');
    const a = await import('@/app/api/usuarios/route');
    const casos: {
      nome: string; metodo: 'PATCH' | 'DELETE'; autorizados: Papel[];
      chamar: (papel: Papel) => Promise<Response>; statusAutorizado: number;
    }[] = [
      { nome: 'usinas PATCH', metodo: 'PATCH', autorizados: ['admin', 'gestor'], statusAutorizado: 400,
        chamar: (papel) => u.PATCH(requisicao('/api/usinas/invalido', 'PATCH', cookies[papel], {}), { params: Promise.resolve({ id: 'invalido' }) }) },
      { nome: 'usinas DELETE', metodo: 'DELETE', autorizados: ['admin'], statusAutorizado: 400,
        chamar: (papel) => u.DELETE(requisicao('/api/usinas/invalido', 'DELETE', cookies[papel]), { params: Promise.resolve({ id: 'invalido' }) }) },
      { nome: 'licencas PATCH', metodo: 'PATCH', autorizados: ['admin', 'gestor'], statusAutorizado: 400,
        chamar: (papel) => l.PATCH(requisicao('/api/licencas/invalido', 'PATCH', cookies[papel], {}), { params: Promise.resolve({ id: 'invalido' }) }) },
      { nome: 'licencas DELETE', metodo: 'DELETE', autorizados: ['admin', 'gestor'], statusAutorizado: 400,
        chamar: (papel) => l.DELETE(requisicao('/api/licencas/invalido', 'DELETE', cookies[papel]), { params: Promise.resolve({ id: 'invalido' }) }) },
      { nome: 'manutencoes PATCH', metodo: 'PATCH', autorizados: ['admin', 'gestor'], statusAutorizado: 400,
        chamar: (papel) => m.PATCH(requisicao('/api/manutencoes/invalido', 'PATCH', cookies[papel], {}), { params: Promise.resolve({ id: 'invalido' }) }) },
      { nome: 'manutencoes DELETE', metodo: 'DELETE', autorizados: ['admin', 'gestor'], statusAutorizado: 400,
        chamar: (papel) => m.DELETE(requisicao('/api/manutencoes/invalido', 'DELETE', cookies[papel]), { params: Promise.resolve({ id: 'invalido' }) }) },
      { nome: 'usuarios PATCH', metodo: 'PATCH', autorizados: ['admin'], statusAutorizado: 422,
        chamar: (papel) => a.PATCH(requisicao('/api/usuarios', 'PATCH', cookies[papel], { id: 'invalido' })) },
    ];
    for (const caso of casos) for (const papel of ['admin', 'gestor', 'consulta'] as const) {
      const res = await caso.chamar(papel);
      expect(res.status, `${caso.nome} ${papel}`).toBe(caso.autorizados.includes(papel) ? caso.statusAutorizado : 403);
    }
  });

  it('enforça papel na API de cada recurso e operação', async () => {
    const casos = [
      { rota: '@/app/api/usinas/route', metodo: 'GET', url: '/api/usinas', permitido: ['admin', 'gestor', 'consulta'] },
      { rota: '@/app/api/licencas/route', metodo: 'GET', url: '/api/licencas', permitido: ['admin', 'gestor', 'consulta'] },
      { rota: '@/app/api/manutencoes/route', metodo: 'GET', url: '/api/manutencoes', permitido: ['admin', 'gestor', 'consulta'] },
      { rota: '@/app/api/atividades/route', metodo: 'GET', url: '/api/atividades', permitido: ['admin', 'gestor', 'consulta'] },
      { rota: '@/app/api/usuarios/route', metodo: 'GET', url: '/api/usuarios', permitido: ['admin'] },
      { rota: '@/app/api/usinas/route', metodo: 'POST', url: '/api/usinas', permitido: ['admin', 'gestor'] },
      { rota: '@/app/api/licencas/route', metodo: 'POST', url: '/api/licencas', permitido: ['admin', 'gestor'] },
      { rota: '@/app/api/manutencoes/route', metodo: 'POST', url: '/api/manutencoes', permitido: ['admin', 'gestor'] },
      { rota: '@/app/api/usuarios/route', metodo: 'POST', url: '/api/usuarios', permitido: ['admin'] },
    ] as const;
    const rotas = {
      '@/app/api/usinas/route': await import('@/app/api/usinas/route'),
      '@/app/api/licencas/route': await import('@/app/api/licencas/route'),
      '@/app/api/manutencoes/route': await import('@/app/api/manutencoes/route'),
      '@/app/api/atividades/route': await import('@/app/api/atividades/route'),
      '@/app/api/usuarios/route': await import('@/app/api/usuarios/route'),
    };
    for (const c of casos) for (const papel of ['admin', 'gestor', 'consulta'] as const) {
      const modulo = rotas[c.rota];
      const requisitar = c.metodo === 'GET' ? modulo.GET : ('POST' in modulo ? modulo.POST : modulo.GET);
      const resultado = await requisitar(requisicao(c.url, c.metodo, cookies[papel], c.metodo === 'POST' ? {} : undefined));
      expect(resultado.status, `${c.metodo} ${c.url}: ${papel}`).toBe((c.permitido as readonly Papel[]).includes(papel) ? (c.metodo === 'GET' ? 200 : 422) : 403);
    }
  });
  it('administrador convida e gerencia conta; não pode desativar a própria', async () => {
    const { POST, GET, PATCH } = await import('@/app/api/usuarios/route');
    const novoEmail = `convite-${randomBytes(6).toString('hex')}@example.test`;
    const criado = await POST(requisicao('/api/usuarios', 'POST', cookies.admin, {
      nome: 'Pessoa convidada', email: novoEmail, papel: 'consulta',
    }));
    expect(criado.status).toBe(201);
    const dados = await criado.json();
    const listado = await GET(requisicao('/api/usuarios', 'GET', cookies.admin));
    expect(listado.status).toBe(200);
    expect((await listado.json() as { email: string }[]).some((u) => u.email === novoEmail)).toBe(true);
    const atualizar = await PATCH(requisicao('/api/usuarios', 'PATCH', cookies.admin,
      { id: dados.id, papel: 'gestor' }));
    expect(atualizar.status).toBe(200);
    const propria = await PATCH(requisicao('/api/usuarios', 'PATCH', cookies.admin,
      { id: ids.admin, ativo: false }));
    expect(propria.status).toBe(403);
    const naoAdmin = await GET(requisicao('/api/usuarios', 'GET', cookies.consulta));
    expect(naoAdmin.status).toBe(403);
  });

  it('API e layout usam as mesmas consultas de dados e perfil', async () => {
    const { GET: dadosGET } = await import('@/app/api/dados/route');
    const { GET: perfilGET, PATCH: perfilPATCH } = await import('@/app/api/perfil/route');
    const { buscarDados, buscarPerfil } = await import('@/lib/consultas');
    const dados = await dadosGET(requisicao('/api/dados', 'GET', cookies.consulta));
    expect(dados.status).toBe(200);
    expect(await dados.json()).toEqual(await buscarDados());
    const perfil = await perfilGET(requisicao('/api/perfil', 'GET', cookies.consulta));
    expect(await perfil.json()).toMatchObject({ papel: 'consulta', tema: 'sistema', menuModo: 'expandido', menuFixado: true });
    const alterado = await perfilPATCH(requisicao('/api/perfil', 'PATCH', cookies.consulta, { tema: 'escuro' }));
    expect(alterado.status).toBe(200);
    expect((await buscarPerfil(ids.consulta!))?.tema).toBe('escuro');
    const invalido = await perfilPATCH(requisicao('/api/perfil', 'PATCH', cookies.consulta, { tema: 'roxo' }));
    expect(invalido.status).toBe(422);
  });

  it('troca de senha autenticada exige senha atual e revoga outras sessões', async () => {
    const { POST } = await import('@/app/api/auth/alterar-senha/route');
    const incorreta = await POST(requisicao('/api/auth/alterar-senha', 'POST', cookies.admin, {
      senhaAtual: 'SenhaIncorreta', novaSenha: 'SenhaNovaSegura#123', confirmacao: 'SenhaNovaSegura#123',
    }));
    expect(incorreta.status).toBe(422);
    const correta = await POST(requisicao('/api/auth/alterar-senha', 'POST', cookies.admin, {
      senhaAtual: 'SenhaOriginalSegura#123', novaSenha: 'SenhaNovaSegura#123', confirmacao: 'SenhaNovaSegura#123',
    }));
    expect(correta.status).toBe(200);
    const sessaoAntiga = await (await import('@/lib/sessao')).lerSessao(cookies.admin);
    expect(await (await import('@/lib/usuarios')).verificarUsuarioSessao(sessaoAntiga!)).toBeNull();
    const nova = await (await import('@/lib/usuarios')).autenticar(emails.admin!, 'SenhaNovaSegura#123');
    expect(nova?.papel).toBe('admin');
  });

});
