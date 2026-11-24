import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import type { Condicionante, CumprimentoCondicionante, Papel } from '@/types/solar';
import { somarMeses, vencimentoDoCiclo } from '@/utils/periodicidade';

/*
 * Cumprimentos e periodicidade (Lote 10).
 * Parte 1: cálculo dos vencimentos (função pura, sem banco).
 * Parte 2: rotas de registro, histórico e cancelamento, no banco de TESTE (TEST_DATABASE_URL).
 */

describe('Cálculo do próximo vencimento', () => {
  it('soma meses usando o último dia quando o dia não existe no mês', () => {
    expect(somarMeses('2027-01-31', 1)).toBe('2027-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29'); // ano bissexto
    expect(somarMeses('2027-03-31', 1)).toBe('2027-04-30');
    expect(somarMeses('2027-04-30', 1)).toBe('2027-05-30');
    expect(somarMeses('2027-11-30', 3)).toBe('2028-02-29'); // vira o ano
    expect(somarMeses('2027-12-15', 1)).toBe('2028-01-15');
    expect(somarMeses('2027-06-10', 0)).toBe('2027-06-10');
  });

  it('mensal: calculado pela âncora, 31/01 não fica preso no dia 28', () => {
    const v = [0, 1, 2, 3, 4, 12, 13].map((c) => vencimentoDoCiclo('2027-01-31', 'mensal', c));
    expect(v).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2028-01-31', '2028-02-29']);
  });

  it('trimestral, semestral e anual', () => {
    expect([0, 1, 2, 3, 4].map((c) => vencimentoDoCiclo('2027-01-31', 'trimestral', c)))
      .toEqual(['2027-01-31', '2027-04-30', '2027-07-31', '2027-10-31', '2028-01-31']);
    expect([0, 1, 2, 3].map((c) => vencimentoDoCiclo('2027-08-31', 'semestral', c)))
      .toEqual(['2027-08-31', '2028-02-29', '2028-08-31', '2029-02-28']);
    expect([0, 1, 2, 3, 4].map((c) => vencimentoDoCiclo('2028-02-29', 'anual', c)))
      .toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  });

  it('única: o vencimento nunca muda', () => {
    expect([0, 1, 5].map((c) => vencimentoDoCiclo('2027-05-20', 'unica', c))).toEqual(['2027-05-20', '2027-05-20', '2027-05-20']);
  });

  it('dez anos de vencimentos mensais a partir do dia 31: sempre o dia 31 ou o último dia do mês', () => {
    for (let c = 0; c < 120; c++) {
      const [ano, mes, dia] = vencimentoDoCiclo('2027-01-31', 'mensal', c).split('-').map(Number);
      const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      expect(dia).toBe(Math.min(31, ultimo));
      expect((ano - 2027) * 12 + (mes - 1)).toBe(c);
    }
  });
});

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const ORIGEM = 'http://localhost:3000';
const PAPEIS = ['admin', 'gestor', 'consulta'] as const;
const NAO_EXISTE = '00000000-0000-4000-8000-000000000000';
type Resposta = { condicionante: Condicionante; cumprimento: CumprimentoCondicionante };

testar('API de cumprimentos', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let orm: typeof import('drizzle-orm');
  let colecao: typeof import('@/app/api/condicionantes/route');
  let item: typeof import('@/app/api/condicionantes/[id]/route');
  let rota: typeof import('@/app/api/condicionantes/[id]/cumprimentos/route');
  let rotaCancelar: typeof import('@/app/api/condicionantes/[id]/cumprimentos/cancelar/route');
  let hoje: string;
  let amanha: string;
  const cookies = {} as Record<Papel, string>;
  const nomes = {} as Record<Papel, string>;
  const ids = { usuarios: [] as string[], usinas: [] as string[] };
  let licenca: string;
  let licencaInativa: string;

  function requisicao(caminho: string, metodo: string, papel?: Papel, corpo?: unknown) {
    return new NextRequest(`${ORIGEM}${caminho}`, {
      method: metodo,
      headers: { Origin: ORIGEM, 'Content-Type': 'application/json', ...(papel ? { cookie: `solaria_session=${cookies[papel]}` } : {}) },
      ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
    });
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const cumprir = (papel: Papel | undefined, id: string, corpo: unknown) =>
    rota.POST(requisicao(`/api/condicionantes/${id}/cumprimentos`, 'POST', papel, corpo), ctx(id));
  const historico = (papel: Papel | undefined, id: string) =>
    rota.GET(requisicao(`/api/condicionantes/${id}/cumprimentos`, 'GET', papel), ctx(id));
  const cancelar = (papel: Papel | undefined, id: string, corpo: unknown) =>
    rotaCancelar.POST(requisicao(`/api/condicionantes/${id}/cumprimentos/cancelar`, 'POST', papel, corpo), ctx(id));

  async function nova(periodicidade: string, prazo: string): Promise<Condicionante> {
    const r = await colecao.POST(requisicao('/api/condicionantes', 'POST', 'admin', {
      licencaId: licenca, codigo: `C-${randomBytes(3).toString('hex')}`, descricao: 'Relatório de monitoramento',
      categoria: 'relatorio', responsavel: 'Equipe ambiental', periodicidade, prazo,
    }));
    expect(r.status).toBe(201);
    return r.json();
  }
  /** Cumpre o vencimento atual e devolve a resposta (falha o teste se não for 201). */
  async function cumpreAtual(c: Pick<Condicionante, 'id' | 'prazo'>, papel: Papel = 'gestor', extra: Record<string, unknown> = {}) {
    const r = await cumprir(papel, c.id, { prazoReferencia: c.prazo, ...extra });
    expect(r.status, `cumprir ${c.prazo}`).toBe(201);
    return r.json() as Promise<Resposta>;
  }
  const noBanco = async (id: string) =>
    (await banco.select().from(schema.condicionantes).where(orm.eq(schema.condicionantes.id, id)))[0];
  const linhasDoHistorico = (id: string) => banco.select().from(schema.condicionanteCumprimentos)
    .where(orm.eq(schema.condicionanteCumprimentos.condicionanteId, id));
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
    rota = await import('@/app/api/condicionantes/[id]/cumprimentos/route');
    rotaCancelar = await import('@/app/api/condicionantes/[id]/cumprimentos/cancelar/route');
    const { hojeServidor } = await import('@/lib/fuso');
    hoje = hojeServidor();
    amanha = hojeServidor(new Date(Date.now() + 36 * 3600_000));
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });
    const { criarToken } = await import('@/lib/sessao');

    for (const papel of PAPEIS) {
      const email = `cumpr-${papel}-${randomBytes(4).toString('hex')}@example.test`;
      nomes[papel] = `Pessoa ${papel} ${randomBytes(2).toString('hex')}`;
      const [u] = await banco.insert(schema.usuarios).values({ email, nome: nomes[papel], papel, senhaHash: 'nao-usado' }).returning();
      ids.usuarios.push(u.id);
      cookies[papel] = await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel });
    }
    const sufixo = randomBytes(4).toString('hex');
    const [ativa, inativa] = await banco.insert(schema.usinas).values([
      { nome: `Usina cumprimentos ${sufixo}`, localizacao: 'Teste, PE', capacidadeKwp: 100, status: 'ativa' },
      { nome: `Usina inativa cumprimentos ${sufixo}`, localizacao: 'Teste, PE', capacidadeKwp: 100, status: 'ativa' },
    ]).returning();
    ids.usinas.push(ativa.id, inativa.id);
    const lic = (usinaId: string, numero: string) => ({ usinaId, tipo: 'Licença de Operação', emissor: 'Órgão', numero, dataValidade: '2035-12-31' });
    const [la, li] = await banco.insert(schema.licencas).values([lic(ativa.id, 'LO-C'), lic(inativa.id, 'LO-CI')]).returning();
    licenca = la.id;
    licencaInativa = li.id;
    await banco.update(schema.usinas).set({ status: 'inativa' }).where(orm.eq(schema.usinas.id, inativa.id));
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

  describe('1. Registro de cumprimento', () => {
    it('mensal: grava o período, avança pela âncora e continua acompanhada (pendente)', async () => {
      const c = await nova('mensal', '2027-01-31');
      await item.PATCH(requisicao(`/api/condicionantes/${c.id}`, 'PATCH', 'admin', { status: 'em_andamento' }), ctx(c.id));
      const r1 = await cumpreAtual(c, 'gestor', { observacao: 'Protocolo 123/2027' });
      expect(r1.condicionante).toMatchObject({ prazo: '2027-02-28', ciclo: 1, calendario: 1, status: 'pendente', ultimoCumprimentoEm: hoje, prazoInicial: '2027-01-31' });
      expect(r1.cumprimento).toMatchObject({
        condicionanteId: c.id, calendario: 1, ciclo: 0, prazoReferencia: '2027-01-31', cumpridaEm: hoje,
        observacao: 'Protocolo 123/2027', registradoPorNome: nomes.gestor,
      });
      expect(r1.cumprimento.canceladoEm).toBeUndefined();
      expect((await ultimaAtividade()).descricao).toMatch(/^Registrou o cumprimento da condicionante .* \(vencimento 2027-01-31\).*; próximo vencimento 2027-02-28$/);
      const r2 = await cumpreAtual(r1.condicionante);
      expect(r2.condicionante).toMatchObject({ prazo: '2027-03-31', ciclo: 2 }); // não ficou preso no dia 28
      const r3 = await cumpreAtual(r2.condicionante);
      expect(r3.condicionante.prazo).toBe('2027-04-30');
    });

    it('trimestral, semestral e anual avançam o número certo de meses', async () => {
      const casos: [string, string, string[]][] = [
        ['trimestral', '2027-01-31', ['2027-04-30', '2027-07-31']],
        ['semestral', '2027-08-31', ['2028-02-29', '2028-08-31']],
        ['anual', '2027-06-15', ['2028-06-15', '2029-06-15']],
      ];
      for (const [periodicidade, prazo, esperados] of casos) {
        let atual: Pick<Condicionante, 'id' | 'prazo'> = await nova(periodicidade, prazo);
        for (const esperado of esperados) {
          atual = (await cumpreAtual(atual)).condicionante;
          expect(atual.prazo, periodicidade).toBe(esperado);
        }
      }
    });

    it('ano bissexto: anual de 29/02 vai para 28/02 e volta a 29/02 quatro anos depois', async () => {
      let atual: Pick<Condicionante, 'id' | 'prazo'> = await nova('anual', '2028-02-29');
      const vistos: string[] = [];
      for (let i = 0; i < 4; i++) {
        atual = (await cumpreAtual(atual)).condicionante;
        vistos.push(atual.prazo);
      }
      expect(vistos).toEqual(['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
      const mensal = await nova('mensal', '2028-01-31');
      expect((await cumpreAtual(mensal)).condicionante.prazo).toBe('2028-02-29');
    });

    it('atrasado: avança um período só e continua vencida até cada período ser cumprido', async () => {
      const c = await nova('mensal', '2026-08-31');
      const r = await cumpreAtual(c, 'gestor', { cumpridaEm: hoje });
      expect(r.condicionante.prazo).toBe('2026-09-30');
      expect(r.condicionante.prazo < hoje).toBe(true); // continua no alerta vermelho
      // Não dá para "pular" para o vencimento seguinte usando o vencimento antigo.
      expect((await cumprir('gestor', c.id, { prazoReferencia: '2026-08-31' })).status).toBe(409);
      expect((await cumpreAtual(r.condicionante)).condicionante.prazo).toBe('2026-10-31');
      expect(await linhasDoHistorico(c.id)).toHaveLength(2);
    });

    it('única: fica cumprida, o prazo não muda e não pode ser cumprida de novo', async () => {
      const c = await nova('unica', '2027-03-10');
      const r = await cumpreAtual(c);
      expect(r.condicionante).toMatchObject({ status: 'cumprida', ciclo: 1, prazo: '2027-03-10', ultimoCumprimentoEm: hoje });
      expect((await ultimaAtividade()).descricao).not.toMatch(/próximo vencimento/);
      const repetido = await cumprir('gestor', c.id, { prazoReferencia: '2027-03-10' });
      expect(repetido.status).toBe(409);
      expect((await repetido.json()).erro).toBe('Esta condicionante única já está cumprida');
      // A regra do Lote 9 agora pelo caminho real: prazo de uma única cumprida não muda.
      expect((await item.PATCH(requisicao(`/api/condicionantes/${c.id}`, 'PATCH', 'admin', { prazo: '2027-04-10' }), ctx(c.id))).status).toBe(409);
    });

    it('data informada: pode ser no passado; no futuro, ou inválida, recebe 422', async () => {
      const c = await nova('mensal', '2027-01-31');
      const futuro = await cumprir('gestor', c.id, { prazoReferencia: c.prazo, cumpridaEm: amanha });
      expect(futuro.status).toBe(422);
      expect((await futuro.json()).detalhes.cumpridaEm).toBe('A data de cumprimento não pode estar no futuro');
      for (const corpo of [{ prazoReferencia: '2027-02-30' }, {}, { prazoReferencia: c.prazo, cumpridaEm: '01/01/2027' }, { prazoReferencia: c.prazo, observacao: 'x'.repeat(301) }]) {
        expect((await cumprir('gestor', c.id, corpo)).status, JSON.stringify(corpo)).toBe(422);
      }
      expect((await cumpreAtual(c, 'gestor', { cumpridaEm: '2026-01-15' })).cumprimento.cumpridaEm).toBe('2026-01-15');
      expect(await linhasDoHistorico(c.id)).toHaveLength(1);
    });

    it('encerrada não recebe cumprimento; reaberta, volta a receber', async () => {
      const c = await nova('mensal', '2027-01-31');
      await item.PATCH(requisicao(`/api/condicionantes/${c.id}`, 'PATCH', 'admin', { status: 'encerrada' }), ctx(c.id));
      expect((await cumprir('gestor', c.id, { prazoReferencia: c.prazo })).status).toBe(409);
      await item.PATCH(requisicao(`/api/condicionantes/${c.id}`, 'PATCH', 'admin', { status: 'pendente' }), ctx(c.id));
      await cumpreAtual(c);
    });
  });

  describe('2. Duplicidade e concorrência', () => {
    it('pedido repetido (duplo clique): o segundo recebe 409 e o prazo avança uma vez só', async () => {
      const c = await nova('mensal', '2027-01-31');
      await cumpreAtual(c);
      const segundo = await cumprir('gestor', c.id, { prazoReferencia: '2027-01-31' });
      expect(segundo.status).toBe(409);
      expect((await segundo.json()).erro).toMatch(/já foi cumprido ou foi alterado/);
      expect(await noBanco(c.id)).toMatchObject({ ciclo: 1, prazo: '2027-02-28' });
      expect(await linhasDoHistorico(c.id)).toHaveLength(1);
    });

    it('5 pedidos simultâneos para o mesmo período: exatamente 1 grava, 4 recebem 409', async () => {
      const c = await nova('mensal', '2027-01-31');
      const respostas = await Promise.all(Array.from({ length: 5 }, (_, i) =>
        cumprir(PAPEIS[i % 2], c.id, { prazoReferencia: '2027-01-31' })));
      expect(respostas.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
      expect(await noBanco(c.id)).toMatchObject({ ciclo: 1, prazo: '2027-02-28' });
      expect(await linhasDoHistorico(c.id)).toHaveLength(1);
    });

    it('2 cancelamentos simultâneos do mesmo cumprimento: 1 cancela, o outro recebe 409', async () => {
      const c = await nova('mensal', '2027-01-31');
      const { cumprimento } = await cumpreAtual(c);
      const corpo = { cumprimentoId: cumprimento.id, motivo: 'Registrado por engano' };
      const respostas = await Promise.all([cancelar('admin', c.id, corpo), cancelar('gestor', c.id, corpo)]);
      expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await noBanco(c.id)).toMatchObject({ ciclo: 0, prazo: '2027-01-31' });
    });

    it('o banco também recusa um segundo cumprimento ativo do mesmo período (gravado fora da API)', async () => {
      const c = await nova('mensal', '2027-01-31');
      const { cumprimento } = await cumpreAtual(c);
      const erro = await banco.insert(schema.condicionanteCumprimentos).values({
        condicionanteId: c.id, calendario: 1, ciclo: 0, prazoReferencia: '2027-01-31', cumpridaEm: hoje, registradoPor: cumprimento.registradoPor,
      }).then(() => null, (e: { cause?: { code?: string } }) => e.cause?.code);
      expect(erro).toBe('23505');
    });
  });

  describe('3. Cancelamento com rastreabilidade', () => {
    it('cancela o último: guarda data, autor e motivo, e a condicionante volta ao vencimento dele', async () => {
      const c = await nova('mensal', '2027-01-31');
      const primeiro = await cumpreAtual(c, 'gestor', { cumpridaEm: '2026-11-01' });
      const segundo = await cumpreAtual(primeiro.condicionante);
      const r = await cancelar('admin', c.id, { cumprimentoId: segundo.cumprimento.id, motivo: 'Relatório enviado ao órgão errado' });
      expect(r.status).toBe(200);
      const { condicionante, cumprimento } = await r.json() as Resposta;
      expect(condicionante).toMatchObject({ ciclo: 1, prazo: '2027-02-28', status: 'pendente', ultimoCumprimentoEm: '2026-11-01' });
      expect(cumprimento).toMatchObject({ id: segundo.cumprimento.id, canceladoPorNome: nomes.admin, motivoCancelamento: 'Relatório enviado ao órgão errado' });
      expect(new Date(cumprimento.canceladoEm!).getTime()).toBeGreaterThanOrEqual(new Date(cumprimento.registradoEm).getTime());
      expect((await ultimaAtividade()).descricao).toMatch(/^Desfez o cumprimento .*Motivo: Relatório enviado ao órgão errado$/);
      // Nada foi apagado: o histórico mostra os dois, o cancelado marcado.
      const lista = await (await historico('consulta', c.id)).json() as CumprimentoCondicionante[];
      expect(lista).toHaveLength(2);
      expect(lista.filter((h) => h.canceladoEm)).toHaveLength(1);
      // O período cancelado pode ser cumprido de novo, e o cancelado continua guardado.
      await cumpreAtual(condicionante);
      expect(await linhasDoHistorico(c.id)).toHaveLength(3);
    });

    it('só o último ativo do calendário atual pode ser cancelado', async () => {
      const c = await nova('mensal', '2027-01-31');
      const primeiro = await cumpreAtual(c);
      const segundo = await cumpreAtual(primeiro.condicionante);
      const antigo = await cancelar('admin', c.id, { cumprimentoId: primeiro.cumprimento.id, motivo: 'Tentando apagar o antigo' });
      expect(antigo.status).toBe(409);
      expect((await antigo.json()).erro).toBe('Só o último cumprimento do calendário atual pode ser desfeito');
      expect((await cancelar('admin', c.id, { cumprimentoId: segundo.cumprimento.id, motivo: 'Engano de data' })).status).toBe(200);
      const repetido = await cancelar('admin', c.id, { cumprimentoId: segundo.cumprimento.id, motivo: 'Engano de data' });
      expect(repetido.status).toBe(409);
      expect((await repetido.json()).erro).toBe('Este cumprimento já foi cancelado');
      // Agora o primeiro é o último ativo e pode ser cancelado; sem cumprimentos, volta ao início.
      const r = await cancelar('gestor', c.id, { cumprimentoId: primeiro.cumprimento.id, motivo: 'Também foi engano' });
      expect((await r.json()).condicionante).toMatchObject({ ciclo: 0, prazo: '2027-01-31' });
      expect((await noBanco(c.id)).ultimoCumprimentoEm).toBeNull();
    });

    it('única cancelada volta a pendente e pode ser cumprida de novo', async () => {
      const c = await nova('unica', '2027-03-10');
      const { cumprimento } = await cumpreAtual(c);
      const r = await cancelar('admin', c.id, { cumprimentoId: cumprimento.id, motivo: 'Documento rejeitado pelo órgão' });
      expect((await r.json()).condicionante).toMatchObject({ status: 'pendente', ciclo: 0, prazo: '2027-03-10' });
      expect((await cumpreAtual(c)).condicionante.status).toBe('cumprida');
    });

    it('validações: motivo obrigatório (422), cumprimento de outra condicionante ou inexistente (404)', async () => {
      const a = await nova('mensal', '2027-01-31');
      const b = await nova('mensal', '2027-01-31');
      const { cumprimento } = await cumpreAtual(a);
      expect((await cancelar('admin', a.id, { cumprimentoId: cumprimento.id, motivo: ' ' })).status).toBe(422);
      expect((await cancelar('admin', a.id, { cumprimentoId: cumprimento.id })).status).toBe(422);
      expect((await cancelar('admin', a.id, { cumprimentoId: 'abc', motivo: 'Motivo válido' })).status).toBe(422);
      expect((await cancelar('admin', b.id, { cumprimentoId: cumprimento.id, motivo: 'Motivo válido' })).status).toBe(404);
      expect((await cancelar('admin', a.id, { cumprimentoId: NAO_EXISTE, motivo: 'Motivo válido' })).status).toBe(404);
      expect((await noBanco(a.id)).ciclo).toBe(1);
    });

    it('condicionante com histórico, mesmo só com cancelados, não pode ser excluída (evidência preservada)', async () => {
      const c = await nova('mensal', '2027-01-31');
      const { cumprimento } = await cumpreAtual(c);
      await cancelar('admin', c.id, { cumprimentoId: cumprimento.id, motivo: 'Registrado por engano' });
      expect((await item.DELETE(requisicao(`/api/condicionantes/${c.id}`, 'DELETE', 'admin'), ctx(c.id))).status).toBe(409);
      expect(await linhasDoHistorico(c.id)).toHaveLength(1);
    });
  });

  describe('4. Calendários reiniciados', () => {
    it('cumpre no calendário novo mesmo com a data de um período antigo; o antigo não pode mais ser desfeito', async () => {
      const c = await nova('mensal', '2027-01-31');
      const p1 = await cumpreAtual(c); // calendário 1, ciclo 0, venc. 31/01
      const p2 = await cumpreAtual(p1.condicionante); // calendário 1, ciclo 1, venc. 28/02
      // Reinício com âncora numa data que já foi cumprida no calendário 1.
      const patch = await item.PATCH(requisicao(`/api/condicionantes/${c.id}`, 'PATCH', 'admin', { prazo: '2027-02-28' }), ctx(c.id));
      expect(await patch.json()).toMatchObject({ calendario: 2, ciclo: 0, prazo: '2027-02-28' });
      const novo = await cumpreAtual({ id: c.id, prazo: '2027-02-28' });
      expect(novo.cumprimento).toMatchObject({ calendario: 2, ciclo: 0, prazoReferencia: '2027-02-28' });
      expect(novo.condicionante).toMatchObject({ calendario: 2, ciclo: 1, prazo: '2027-03-28' }); // âncora nova: dia 28
      expect((await cancelar('admin', c.id, { cumprimentoId: p2.cumprimento.id, motivo: 'Do calendário antigo' })).status).toBe(409);
      expect((await cancelar('admin', c.id, { cumprimentoId: novo.cumprimento.id, motivo: 'Do calendário novo' })).status).toBe(200);
      expect(await noBanco(c.id)).toMatchObject({ calendario: 2, ciclo: 0, prazo: '2027-02-28' });
      const lista = await (await historico('consulta', c.id)).json() as CumprimentoCondicionante[];
      expect(lista.map((h) => `${h.calendario}/${h.ciclo}/${h.prazoReferencia}/${h.canceladoEm ? 'cancelado' : 'ativo'}`).sort())
        .toEqual(['1/0/2027-01-31/ativo', '1/1/2027-02-28/ativo', '2/0/2027-02-28/cancelado']);
    });
  });

  describe('5. Permissões, usina inativa e erros', () => {
    it('sem sessão: 401 em consultar, cumprir e cancelar', async () => {
      const c = await nova('mensal', '2027-01-31');
      expect((await historico(undefined, c.id)).status).toBe(401);
      expect((await cumprir(undefined, c.id, { prazoReferencia: c.prazo })).status).toBe(401);
      expect((await cancelar(undefined, c.id, { cumprimentoId: NAO_EXISTE, motivo: 'Motivo válido' })).status).toBe(401);
    });

    it('três perfis: todos consultam; admin e gestor cumprem e cancelam; consulta recebe 403', async () => {
      for (const papel of PAPEIS) {
        const pode = papel !== 'consulta';
        const c = await nova('mensal', '2027-01-31');
        expect((await historico(papel, c.id)).status, `GET ${papel}`).toBe(200);
        const r = await cumprir(papel, c.id, { prazoReferencia: c.prazo });
        expect(r.status, `cumprir ${papel}`).toBe(pode ? 201 : 403);
        const alvo = pode ? (await r.json() as Resposta).cumprimento : (await cumpreAtual(c, 'admin')).cumprimento;
        expect((await cancelar(papel, c.id, { cumprimentoId: alvo.id, motivo: 'Teste de permissão' })).status, `cancelar ${papel}`).toBe(pode ? 200 : 403);
        if (!pode) expect((await linhasDoHistorico(c.id)).every((h) => h.canceladoEm === null)).toBe(true);
      }
    });

    it('usina inativa: histórico pode ser lido; cumprir e cancelar recebem 403 e nada muda', async () => {
      const [c] = await banco.insert(schema.condicionantes).values({
        licencaId: licencaInativa, codigo: 'INATIVA-1', descricao: 'Da usina inativa', categoria: 'outro', responsavel: 'Equipe',
        periodicidade: 'mensal', prazoInicial: '2027-01-31', prazo: '2027-02-28', ciclo: 1, ultimoCumprimentoEm: '2026-11-01',
      }).returning();
      const [h] = await banco.insert(schema.condicionanteCumprimentos).values({
        condicionanteId: c.id, calendario: 1, ciclo: 0, prazoReferencia: '2027-01-31', cumpridaEm: '2026-11-01', registradoPor: ids.usuarios[0],
      }).returning();
      expect((await historico('consulta', c.id)).status).toBe(200);
      expect((await cumprir('admin', c.id, { prazoReferencia: '2027-02-28' })).status).toBe(403);
      expect((await cancelar('admin', c.id, { cumprimentoId: h.id, motivo: 'Tentativa na inativa' })).status).toBe(403);
      expect(await noBanco(c.id)).toMatchObject({ ciclo: 1, prazo: '2027-02-28' });
      expect((await linhasDoHistorico(c.id))[0].canceladoEm).toBeNull();
    });

    it('condicionante inexistente: 404; id malformado: 400', async () => {
      expect((await historico('admin', NAO_EXISTE)).status).toBe(404);
      expect((await cumprir('admin', NAO_EXISTE, { prazoReferencia: '2027-01-31' })).status).toBe(404);
      expect((await cancelar('admin', NAO_EXISTE, { cumprimentoId: NAO_EXISTE, motivo: 'Motivo válido' })).status).toBe(404);
      expect((await historico('admin', 'abc')).status).toBe(400);
      expect((await cumprir('admin', 'abc', { prazoReferencia: '2027-01-31' })).status).toBe(400);
      expect((await cancelar('admin', 'abc', { cumprimentoId: NAO_EXISTE, motivo: 'Motivo válido' })).status).toBe(400);
    });
  });
});
