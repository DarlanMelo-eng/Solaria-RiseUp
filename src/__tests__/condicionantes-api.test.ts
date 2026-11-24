import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import type { Papel } from '@/types/solar';

/*
 * CRUD REST de condicionantes (Lote 9): GET, POST, PATCH e DELETE, com permissões, usina inativa,
 * código único por licença, PATCH vazio = 422, "cumprida" proibida no PATCH, calendário reiniciado
 * ao mudar prazo ou periodicidade, e exclusão bloqueada = 409 (23503 até o PostgreSQL 17, 23001 no 18).
 * Roda só no banco de TESTE (TEST_DATABASE_URL).
 */

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const ORIGEM = 'http://localhost:3000';
const PAPEIS = ['admin', 'gestor', 'consulta'] as const;
const NAO_EXISTE = '00000000-0000-4000-8000-000000000000';

testar('API de condicionantes', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let orm: typeof import('drizzle-orm');
  let colecao: typeof import('@/app/api/condicionantes/route');
  let item: typeof import('@/app/api/condicionantes/[id]/route');
  let licencaRota: typeof import('@/app/api/licencas/[id]/route');
  const cookies = {} as Record<Papel, string>;
  const ids = { usuarios: [] as string[], usinas: [] as string[] };
  let usinaAtiva: string;
  let usinaInativa: string;
  let licencaA: string;
  let licencaB: string;
  let licencaInativa: string;
  let registradora: string;

  function requisicao(caminho: string, metodo: string, papel?: Papel, corpo?: unknown, extra: Record<string, string> = {}) {
    return new NextRequest(`${ORIGEM}${caminho}`, {
      method: metodo,
      headers: {
        Origin: ORIGEM, 'Content-Type': 'application/json',
        ...(papel ? { cookie: `solaria_session=${cookies[papel]}` } : {}), ...extra,
      },
      ...(corpo !== undefined ? { body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) } : {}),
    });
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const listar = (papel: Papel, query = '') => colecao.GET(requisicao(`/api/condicionantes${query}`, 'GET', papel));
  const obter = (papel: Papel, id: string) => item.GET(requisicao(`/api/condicionantes/${id}`, 'GET', papel), ctx(id));
  const criar = (papel: Papel, corpo: unknown) => colecao.POST(requisicao('/api/condicionantes', 'POST', papel, corpo));
  const editar = (papel: Papel, id: string, corpo: unknown) => item.PATCH(requisicao(`/api/condicionantes/${id}`, 'PATCH', papel, corpo), ctx(id));
  const excluir = (papel: Papel, id: string) => item.DELETE(requisicao(`/api/condicionantes/${id}`, 'DELETE', papel), ctx(id));

  const codigo = () => `C-${randomBytes(3).toString('hex')}`;
  const valida = (campos: Record<string, unknown> = {}) => ({
    licencaId: licencaA, codigo: codigo(), descricao: 'Enviar relatório trimestral de ruído', categoria: 'relatorio',
    responsavel: 'Equipe ambiental', periodicidade: 'mensal', prazo: '2027-01-31', ...campos,
  });
  /** Cria pela API (como admin) e devolve o corpo da resposta. */
  async function nova(campos: Record<string, unknown> = {}) {
    const r = await criar('admin', valida(campos));
    expect(r.status).toBe(201);
    return r.json() as Promise<import('@/types/solar').Condicionante>;
  }
  const noBanco = async (id: string) =>
    (await banco.select().from(schema.condicionantes).where(orm.eq(schema.condicionantes.id, id)))[0];
  const ultimaAtividade = async () => (await banco.select().from(schema.atividades)
    .orderBy(orm.desc(schema.atividades.em), orm.desc(schema.atividades.id)).limit(1))[0];

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
    colecao = await import('@/app/api/condicionantes/route');
    item = await import('@/app/api/condicionantes/[id]/route');
    licencaRota = await import('@/app/api/licencas/[id]/route');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });
    const { criarToken } = await import('@/lib/sessao');

    for (const papel of PAPEIS) {
      const email = `cond-api-${papel}-${randomBytes(4).toString('hex')}@example.test`;
      const [u] = await banco.insert(schema.usuarios).values({ email, nome: `Pessoa ${papel}`, papel, senhaHash: 'nao-usado' }).returning();
      ids.usuarios.push(u.id);
      cookies[papel] = await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel });
      if (papel === 'gestor') registradora = u.id;
    }
    const sufixo = randomBytes(4).toString('hex');
    const usinasCriadas = await banco.insert(schema.usinas).values([
      { nome: `Usina ativa ${sufixo}`, localizacao: 'Teste, PE', capacidadeKwp: 100, status: 'ativa' },
      { nome: `Usina inativa ${sufixo}`, localizacao: 'Teste, PE', capacidadeKwp: 100, status: 'ativa' },
    ]).returning();
    [usinaAtiva, usinaInativa] = usinasCriadas.map((u) => u.id);
    ids.usinas.push(usinaAtiva, usinaInativa);
    const lic = (usinaId: string, numero: string) => ({ usinaId, tipo: 'Licença de Operação', emissor: 'Órgão', numero, dataValidade: '2030-12-31' });
    const licencasCriadas = await banco.insert(schema.licencas)
      .values([lic(usinaAtiva, 'LO-A'), lic(usinaAtiva, 'LO-B'), lic(usinaInativa, 'LO-I')]).returning();
    [licencaA, licencaB, licencaInativa] = licencasCriadas.map((l) => l.id);
    // A licença foi criada com a usina ainda ativa; agora ela fica somente leitura.
    await banco.update(schema.usinas).set({ status: 'inativa' }).where(orm.eq(schema.usinas.id, usinaInativa));
  });

  afterAll(async () => {
    if (!pool) return;
    if (ids.usinas.length) {
      const lics = (await banco.select({ id: schema.licencas.id }).from(schema.licencas)
        .where(orm.inArray(schema.licencas.usinaId, ids.usinas))).map((l) => l.id);
      if (lics.length) {
        const conds = (await banco.select({ id: schema.condicionantes.id }).from(schema.condicionantes)
          .where(orm.inArray(schema.condicionantes.licencaId, lics))).map((c) => c.id);
        if (conds.length) {
          await banco.delete(schema.condicionanteCumprimentos).where(orm.inArray(schema.condicionanteCumprimentos.condicionanteId, conds));
          await banco.delete(schema.condicionantes).where(orm.inArray(schema.condicionantes.id, conds));
        }
        await banco.delete(schema.licencas).where(orm.inArray(schema.licencas.id, lics));
      }
      await banco.delete(schema.usinas).where(orm.inArray(schema.usinas.id, ids.usinas));
    }
    if (ids.usuarios.length) await banco.delete(schema.usuarios).where(orm.inArray(schema.usuarios.id, ids.usuarios));
    await pool.end();
  });

  describe('1. Autenticação e permissões', () => {
    it('sem sessão: 401 em todas as operações', async () => {
      const c = await nova();
      expect((await colecao.GET(requisicao('/api/condicionantes', 'GET'))).status).toBe(401);
      expect((await item.GET(requisicao(`/api/condicionantes/${c.id}`, 'GET'), ctx(c.id))).status).toBe(401);
      expect((await colecao.POST(requisicao('/api/condicionantes', 'POST', undefined, valida()))).status).toBe(401);
      expect((await item.PATCH(requisicao(`/api/condicionantes/${c.id}`, 'PATCH', undefined, { codigo: 'X' }), ctx(c.id))).status).toBe(401);
      expect((await item.DELETE(requisicao(`/api/condicionantes/${c.id}`, 'DELETE'), ctx(c.id))).status).toBe(401);
    });

    it('matriz por perfil: todos leem; admin e gestor criam, editam e excluem; consulta recebe 403', async () => {
      for (const papel of PAPEIS) {
        const escreve = papel !== 'consulta';
        const c = await nova();
        expect((await listar(papel)).status, `GET lista ${papel}`).toBe(200);
        expect((await obter(papel, c.id)).status, `GET item ${papel}`).toBe(200);
        expect((await criar(papel, valida())).status, `POST ${papel}`).toBe(escreve ? 201 : 403);
        expect((await editar(papel, c.id, { responsavel: 'Outra equipe' })).status, `PATCH ${papel}`).toBe(escreve ? 200 : 403);
        expect((await excluir(papel, c.id)).status, `DELETE ${papel}`).toBe(escreve ? 200 : 403);
        if (!escreve) expect(await noBanco(c.id)).toMatchObject({ responsavel: 'Equipe ambiental' });
      }
    });

    it('origem de outro site é recusada (CSRF), mesmo com sessão válida', async () => {
      const r = await colecao.POST(requisicao('/api/condicionantes', 'POST', 'admin', valida(), { Origin: 'https://evil.example' }));
      expect(r.status).toBe(403);
    });
  });

  describe('2. Cadastro (POST)', () => {
    it('201 com prazo como âncora, calendário 1, ciclo 0, pendente; registra no histórico', async () => {
      const r = await criar('gestor', valida({ codigo: 'Cond. 1', observacao: 'Protocolo no órgão' }));
      expect(r.status).toBe(201);
      const c = await r.json();
      expect(c).toMatchObject({
        licencaId: licencaA, codigo: 'Cond. 1', prazoInicial: '2027-01-31', prazo: '2027-01-31',
        calendario: 1, ciclo: 0, status: 'pendente', observacao: 'Protocolo no órgão',
      });
      expect(c.ultimoCumprimentoEm).toBeUndefined();
      expect(new Date(c.criadoEm).toISOString()).toBe(c.criadoEm);
      expect((await ultimaAtividade()).descricao).toMatch(/^Cadastrou a condicionante Cond\. 1 em Licença de Operação \(LO-A\)/);
    });

    it('campos do servidor enviados pelo cliente são ignorados', async () => {
      const c = await nova({ ciclo: 7, calendario: 9, prazoInicial: '2020-01-01', ultimoCumprimentoEm: '2026-01-01', id: NAO_EXISTE });
      expect(c).toMatchObject({ ciclo: 0, calendario: 1, prazoInicial: '2027-01-31' });
      expect(c.ultimoCumprimentoEm).toBeUndefined();
      expect(c.id).not.toBe(NAO_EXISTE);
    });

    it('código repetido na mesma licença, sem diferenciar maiúsculas: 409; em outra licença: 201', async () => {
      await nova({ codigo: 'Cond. 9' });
      const repetido = await criar('admin', valida({ codigo: 'COND. 9' }));
      expect(repetido.status).toBe(409);
      expect(await repetido.json()).toMatchObject({ erro: 'Já existe uma condicionante com esse código nesta licença', detalhes: { codigo: 'Código já usado nesta licença' } });
      expect((await criar('admin', valida({ codigo: 'cond. 9', licencaId: licencaB }))).status).toBe(201);
    });

    it('licença inexistente: 404; identificador malformado: 422', async () => {
      expect((await criar('admin', valida({ licencaId: NAO_EXISTE }))).status).toBe(404);
      const r = await criar('admin', valida({ licencaId: 'abc' }));
      expect(r.status).toBe(422);
      expect((await r.json()).detalhes).toHaveProperty('licencaId');
    });

    it('usina inativa: 403 e nada é gravado', async () => {
      const r = await criar('admin', valida({ licencaId: licencaInativa, codigo: 'NAO-GRAVA' }));
      expect(r.status).toBe(403);
      const linhas = await banco.select().from(schema.condicionantes).where(orm.eq(schema.condicionantes.licencaId, licencaInativa));
      expect(linhas).toHaveLength(0);
    });

    it('não nasce cumprida nem encerrada', async () => {
      for (const status of ['cumprida', 'encerrada']) {
        const r = await criar('admin', valida({ status }));
        expect(r.status, status).toBe(422);
        expect((await r.json()).detalhes.status).toBe('Uma condicionante nova começa pendente ou em andamento');
      }
      expect((await criar('admin', valida({ status: 'em_andamento' }))).status).toBe(201);
    });

    it('validação Zod: 422 com o campo que falhou', async () => {
      const casos: [Record<string, unknown>, string][] = [
        [{ categoria: 'inventada' }, 'categoria'],
        [{ periodicidade: 'diaria' }, 'periodicidade'],
        [{ prazo: '2027-02-30' }, 'prazo'],
        [{ prazo: '31/01/2027' }, 'prazo'],
        [{ codigo: '   ' }, 'codigo'],
        [{ codigo: 'x'.repeat(21) }, 'codigo'],
        [{ descricao: 'ab' }, 'descricao'],
        [{ responsavel: '' }, 'responsavel'],
        [{ observacao: 'x'.repeat(301) }, 'observacao'],
      ];
      for (const [campos, campo] of casos) {
        const r = await criar('admin', valida(campos));
        expect(r.status, JSON.stringify(campos)).toBe(422);
        expect((await r.json()).detalhes, JSON.stringify(campos)).toHaveProperty(campo);
      }
    });

    it('corpo que não é JSON: 415; JSON quebrado: 400', async () => {
      const texto = colecao.POST(requisicao('/api/condicionantes', 'POST', 'admin', 'codigo=1', { 'Content-Type': 'text/plain' }));
      expect((await texto).status).toBe(415);
      expect((await criar('admin', '{"codigo":')).status).toBe(400);
    });
  });

  describe('3. Leitura (GET)', () => {
    it('filtra por licença e por usina, ordena por prazo e valida os identificadores', async () => {
      const tarde = await nova({ licencaId: licencaB, prazo: '2028-06-30' });
      const cedo = await nova({ licencaId: licencaB, prazo: '2027-03-31' });
      const daLicenca = await (await listar('consulta', `?licencaId=${licencaB}`)).json() as { id: string; licencaId: string; prazo: string }[];
      expect(daLicenca.every((c) => c.licencaId === licencaB)).toBe(true);
      const posicao = (id: string) => daLicenca.findIndex((c) => c.id === id);
      expect(posicao(cedo.id)).toBeLessThan(posicao(tarde.id));
      const daUsina = await (await listar('consulta', `?usinaId=${usinaAtiva}`)).json() as { licencaId: string }[];
      expect(daUsina.length).toBeGreaterThan(0);
      expect(daUsina.every((c) => c.licencaId === licencaA || c.licencaId === licencaB)).toBe(true);
      expect(await (await listar('consulta', `?usinaId=${usinaInativa}`)).json()).toEqual([]);
      expect((await listar('consulta', '?licencaId=abc')).status).toBe(400);
      expect((await listar('consulta', '?usinaId=abc')).status).toBe(400);
    });

    it('item: 200 com os dados; 404 se não existe; 400 se o id é malformado', async () => {
      const c = await nova();
      expect(await (await obter('consulta', c.id)).json()).toEqual(c);
      expect((await obter('consulta', NAO_EXISTE)).status).toBe(404);
      expect((await obter('consulta', 'abc')).status).toBe(400);
    });
  });

  describe('4. Edição (PATCH)', () => {
    it('corpo vazio, ou só com campos que não podem ser editados: 422', async () => {
      const c = await nova();
      for (const corpo of [{}, { ciclo: 3 }, { calendario: 2, ultimoCumprimentoEm: '2027-01-01' }, { licencaId: licencaB }]) {
        const r = await editar('admin', c.id, corpo);
        expect(r.status, JSON.stringify(corpo)).toBe(422);
        expect((await r.json()).detalhes.corpo).toBe('Envie ao menos um campo para alterar');
      }
      expect(await noBanco(c.id)).toMatchObject({ licencaId: licencaA, ciclo: 0, calendario: 1 });
    });

    it('não marca como cumprida: 422 com orientação, e nada muda', async () => {
      const c = await nova();
      const r = await editar('admin', c.id, { status: 'cumprida' });
      expect(r.status).toBe(422);
      expect((await r.json()).detalhes.status).toBe('Para marcar como cumprida, registre o cumprimento da condicionante');
      expect((await noBanco(c.id)).status).toBe('pendente');
    });

    it('edita textos sem mexer no calendário e atualiza atualizado_em', async () => {
      const c = await nova();
      const antes = await noBanco(c.id);
      const r = await editar('gestor', c.id, { descricao: 'Nova descrição da obrigação', prazo: c.prazo, periodicidade: c.periodicidade });
      expect(r.status).toBe(200);
      const depois = await noBanco(c.id);
      expect(depois).toMatchObject({ descricao: 'Nova descrição da obrigação', calendario: 1, ciclo: 0, prazoInicial: '2027-01-31' });
      expect(depois.atualizadoEm.getTime()).toBeGreaterThan(antes.atualizadoEm.getTime());
      expect((await ultimaAtividade()).descricao).toMatch(/^Editou a condicionante /);
    });

    it('mudar o prazo abre um calendário novo: âncora = novo prazo, ciclo 0', async () => {
      const c = await nova();
      await banco.update(schema.condicionantes).set({ ciclo: 2, prazo: '2027-03-31' }).where(orm.eq(schema.condicionantes.id, c.id));
      const r = await editar('admin', c.id, { prazo: '2027-05-15' });
      expect(await r.json()).toMatchObject({ calendario: 2, ciclo: 0, prazoInicial: '2027-05-15', prazo: '2027-05-15' });
      expect((await ultimaAtividade()).descricao).toMatch(/reiniciou o calendário de prazos$/);
    });

    it('mudar a periodicidade também reinicia, com a âncora no próximo vencimento atual', async () => {
      const c = await nova();
      await banco.update(schema.condicionantes).set({ ciclo: 1, prazo: '2027-02-28' }).where(orm.eq(schema.condicionantes.id, c.id));
      const r = await editar('admin', c.id, { periodicidade: 'trimestral' });
      expect(await r.json()).toMatchObject({ periodicidade: 'trimestral', calendario: 2, ciclo: 0, prazoInicial: '2027-02-28', prazo: '2027-02-28' });
    });

    it('periódica passa a única: o banco aceita porque o calendário reinicia', async () => {
      const c = await nova();
      await banco.update(schema.condicionantes).set({ ciclo: 3, prazo: '2027-04-30' }).where(orm.eq(schema.condicionantes.id, c.id));
      expect(await (await editar('admin', c.id, { periodicidade: 'unica' })).json())
        .toMatchObject({ periodicidade: 'unica', ciclo: 0, prazoInicial: '2027-04-30', prazo: '2027-04-30' });
    });

    it('código repetido na mesma licença: 409', async () => {
      await nova({ codigo: 'Cond. 50' });
      const c = await nova();
      const r = await editar('admin', c.id, { codigo: 'cond. 50' });
      expect(r.status).toBe(409);
      expect((await noBanco(c.id)).codigo).toBe(c.codigo);
    });

    it('encerrar e reabrir, cada um com o seu registro no histórico', async () => {
      const c = await nova();
      expect((await (await editar('admin', c.id, { status: 'encerrada' })).json()).status).toBe('encerrada');
      expect((await ultimaAtividade()).descricao).toMatch(/^Encerrou a condicionante /);
      expect((await (await editar('admin', c.id, { status: 'pendente' })).json()).status).toBe('pendente');
      expect((await ultimaAtividade()).descricao).toMatch(/^Reabriu a condicionante /);
    });

    it('única já cumprida: textos podem mudar; prazo, periodicidade e situação: 409', async () => {
      const c = await nova({ periodicidade: 'unica' });
      // O Lote 10 fará isto pela rota de cumprimentos; aqui simulamos direto no banco.
      await banco.update(schema.condicionantes).set({ status: 'cumprida', ciclo: 1, ultimoCumprimentoEm: '2027-01-20' })
        .where(orm.eq(schema.condicionantes.id, c.id));
      for (const corpo of [{ prazo: '2027-06-30' }, { periodicidade: 'mensal' }, { status: 'pendente' }, { status: 'encerrada' }]) {
        const r = await editar('admin', c.id, corpo);
        expect(r.status, JSON.stringify(corpo)).toBe(409);
      }
      expect((await editar('admin', c.id, { observacao: 'Ofício arquivado' })).status).toBe(200);
      expect(await noBanco(c.id)).toMatchObject({ status: 'cumprida', ciclo: 1, observacao: 'Ofício arquivado' });
    });

    it('usina inativa: 403 e nada muda; id inexistente: 404; malformado: 400', async () => {
      const [c] = await banco.insert(schema.condicionantes).values({
        licencaId: licencaInativa, codigo: codigo(), descricao: 'Da usina inativa', categoria: 'outro',
        responsavel: 'Equipe', periodicidade: 'anual', prazoInicial: '2027-01-01', prazo: '2027-01-01',
      }).returning(); // direto no banco: pela API, a usina inativa não aceita cadastro
      expect((await editar('admin', c.id, { descricao: 'Tentativa de mudar' })).status).toBe(403);
      expect((await noBanco(c.id)).descricao).toBe('Da usina inativa');
      expect((await excluir('admin', c.id)).status).toBe(403);
      expect(await noBanco(c.id)).toBeDefined();
      expect((await editar('admin', NAO_EXISTE, { descricao: 'Nada aqui' })).status).toBe(404);
      expect((await editar('admin', 'abc', { descricao: 'Nada aqui' })).status).toBe(400);
    });
  });

  describe('5. Exclusão (DELETE) e relacionamentos', () => {
    it('sem histórico: 200, some do banco e registra no histórico de atividades', async () => {
      const c = await nova();
      expect((await excluir('gestor', c.id)).status).toBe(200);
      expect(await noBanco(c.id)).toBeUndefined();
      expect((await ultimaAtividade()).descricao).toMatch(new RegExp(`^Excluiu a condicionante ${c.codigo} `));
      expect((await excluir('gestor', c.id)).status).toBe(404);
    });

    it('com cumprimento registrado: 409, e a condicionante e o histórico continuam lá', async () => {
      const c = await nova();
      await banco.insert(schema.condicionanteCumprimentos).values({
        condicionanteId: c.id, calendario: 1, ciclo: 0, prazoReferencia: c.prazo, cumpridaEm: '2027-01-30', registradoPor: registradora,
      });
      const r = await excluir('admin', c.id);
      expect(r.status).toBe(409);
      expect((await r.json()).erro).toMatch(/encerre-a em vez de excluir/);
      expect(await noBanco(c.id)).toBeDefined();
      const historico = await banco.select().from(schema.condicionanteCumprimentos)
        .where(orm.eq(schema.condicionanteCumprimentos.condicionanteId, c.id));
      expect(historico).toHaveLength(1);
    });

    it('licença com condicionantes: DELETE da licença responde 409 e nada é apagado', async () => {
      const [licenca] = await banco.insert(schema.licencas).values({
        usinaId: usinaAtiva, tipo: 'Licença de Instalação', emissor: 'Órgão', numero: `LI-${randomBytes(3).toString('hex')}`, dataValidade: '2030-01-01',
      }).returning();
      const c = await nova({ licencaId: licenca.id });
      const r = await licencaRota.DELETE(requisicao(`/api/licencas/${licenca.id}`, 'DELETE', 'admin'), ctx(licenca.id));
      expect(r.status).toBe(409);
      expect((await r.json()).erro).toBe('Exclua antes as condicionantes desta licença');
      expect(await noBanco(c.id)).toBeDefined();
      // Sem condicionantes, a exclusão da licença continua funcionando como antes.
      expect((await excluir('admin', c.id)).status).toBe(200);
      expect((await licencaRota.DELETE(requisicao(`/api/licencas/${licenca.id}`, 'DELETE', 'admin'), ctx(licenca.id))).status).toBe(200);
    });

    it('o banco recusa com 23503 até o PostgreSQL 17 e 23001 a partir do 18: as rotas tratam os dois', async () => {
      const { bloqueadoPorRelacionamento, codigoPostgres } = await import('@/lib/db/erros');
      const c = await nova();
      const versao = (await pool.query<{ v: number }>("SELECT current_setting('server_version_num')::int AS v")).rows[0].v;
      expect(versao).toBeGreaterThan(120000);
      const erro = await banco.delete(schema.licencas).where(orm.eq(schema.licencas.id, c.licencaId)).then(() => null, (e: unknown) => e);
      expect(codigoPostgres(erro)).toBe(versao >= 180000 ? '23001' : '23503');
      expect(bloqueadoPorRelacionamento(erro)).toBe(true);
      expect(bloqueadoPorRelacionamento({ code: '23001' })).toBe(true);
      expect(bloqueadoPorRelacionamento({ cause: { code: '23503' } })).toBe(true);
      expect(bloqueadoPorRelacionamento({ code: '23505' })).toBe(false);
      expect(bloqueadoPorRelacionamento(new Error('outro'))).toBe(false);
    });
  });
});
