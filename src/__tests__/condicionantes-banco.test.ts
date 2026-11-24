import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Estrutura de condicionantes (Lote 8): só o banco, sem API.
 * Confere a migração 0002, as chaves estrangeiras, a unicidade, os status e o histórico de
 * cumprimentos (cancelar em vez de apagar; calendário reiniciado sem conflito com o antigo).
 * Roda só no banco de TESTE (TEST_DATABASE_URL). A trava do drizzle.config.ts é testada com um
 * banco falso numa porta fechada: nenhum banco real é tocado.
 */

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const executar = promisify(execFile);

/** Código e nome da restrição do erro do PostgreSQL (o driver pode aninhar o erro em `cause`). */
function erroPostgres(e: unknown): { code?: string; constraint?: string } {
  if (!e || typeof e !== 'object') return {};
  if ('code' in e && typeof e.code === 'string') return e as { code: string; constraint?: string };
  return 'cause' in e ? erroPostgres(e.cause) : {};
}
async function falha(promessa: Promise<unknown>, code: string | readonly string[], constraint?: string) {
  const erro = await promessa.then(() => null, (e: unknown) => erroPostgres(e));
  expect(erro, 'a operação deveria ter sido recusada pelo banco').not.toBeNull();
  expect(typeof code === 'string' ? [code] : code).toContain(erro?.code);
  if (constraint) expect(erro?.constraint).toBe(constraint);
}

testar('Estrutura de condicionantes e histórico de cumprimentos', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let orm: typeof import('drizzle-orm');
  const criados = { usinas: [] as string[], licencas: [] as string[], usuarios: [] as string[] };
  let licencaA: string;
  let licencaB: string;
  let pessoa: string;

  type Campos = Partial<typeof import('@/lib/db/schema').condicionantes.$inferInsert>;
  /** Condicionante válida; os campos passados substituem os padrões. */
  function condicionante(campos: Campos = {}) {
    return banco.insert(schema.condicionantes).values({
      licencaId: licencaA, codigo: `C-${randomBytes(3).toString('hex')}`, descricao: 'Enviar relatório de monitoramento',
      categoria: 'relatorio', responsavel: 'Equipe ambiental', periodicidade: 'mensal',
      prazoInicial: '2027-01-31', prazo: '2027-01-31', ...campos,
    }).returning().then((linhas) => linhas[0]);
  }
  type CamposCumprimento = Partial<typeof import('@/lib/db/schema').condicionanteCumprimentos.$inferInsert>;
  function cumprimento(condicionanteId: string, campos: CamposCumprimento = {}) {
    return banco.insert(schema.condicionanteCumprimentos).values({
      condicionanteId, calendario: 1, ciclo: 0, prazoReferencia: '2027-01-31', cumpridaEm: '2027-01-30',
      registradoPor: pessoa, ...campos,
    }).returning().then((linhas) => linhas[0]);
  }
  const cancelamento = (id: string, motivo = 'Registrado na condicionante errada') =>
    banco.update(schema.condicionanteCumprimentos)
      .set({ canceladoEm: new Date(Date.now() + 1000), canceladoPor: pessoa, motivoCancelamento: motivo })
      .where(orm.eq(schema.condicionanteCumprimentos.id, id));

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL deve apontar para banco isolado de DATABASE_URL.');
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SSL = 'false';
    ({ pool, banco } = await import('@/lib/db'));
    schema = await import('@/lib/db/schema');
    orm = await import('drizzle-orm');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });

    const [usina] = await banco.insert(schema.usinas).values({
      nome: `Usina condicionantes ${randomBytes(4).toString('hex')}`, localizacao: 'Teste', capacidadeKwp: 100, status: 'ativa',
    }).returning();
    criados.usinas.push(usina.id);
    const licencas = await banco.insert(schema.licencas).values(['LO-1', 'LO-2'].map((numero) => ({
      usinaId: usina.id, tipo: 'Licença de Operação', emissor: 'Órgão de teste', numero, dataValidade: '2030-12-31',
    }))).returning();
    [licencaA, licencaB] = licencas.map((l) => l.id);
    criados.licencas.push(licencaA, licencaB);
    const [u] = await banco.insert(schema.usuarios).values({
      email: `cond-${randomBytes(6).toString('hex')}@example.test`, nome: 'Registradora', papel: 'gestor', senhaHash: 'nao-usado',
    }).returning();
    pessoa = u.id;
    criados.usuarios.push(pessoa);
  });

  afterAll(async () => {
    if (!pool) return;
    // Ordem inversa das chaves estrangeiras (todas RESTRICT).
    if (criados.licencas.length) {
      const conds = await banco.select({ id: schema.condicionantes.id }).from(schema.condicionantes)
        .where(orm.inArray(schema.condicionantes.licencaId, criados.licencas));
      if (conds.length) {
        await banco.delete(schema.condicionanteCumprimentos)
          .where(orm.inArray(schema.condicionanteCumprimentos.condicionanteId, conds.map((c) => c.id)));
        await banco.delete(schema.condicionantes).where(orm.inArray(schema.condicionantes.id, conds.map((c) => c.id)));
      }
      await banco.delete(schema.licencas).where(orm.inArray(schema.licencas.id, criados.licencas));
    }
    if (criados.usinas.length) await banco.delete(schema.usinas).where(orm.inArray(schema.usinas.id, criados.usinas));
    if (criados.usuarios.length) await banco.delete(schema.usuarios).where(orm.inArray(schema.usuarios.id, criados.usuarios));
    await pool.end();
  });

  describe('1. Migração 0002', () => {
    it('é incremental: o journal mantém 0000 e 0001 e acrescenta só a 0002', () => {
      const journal = JSON.parse(readFileSync(path.resolve('src/lib/db/migrations/meta/_journal.json'), 'utf8'));
      // As três primeiras, nesta ordem; migrações posteriores (0003...) podem vir depois.
      expect(journal.entries.slice(0, 3).map((e: { tag: string }) => e.tag)).toEqual(['0000_inicial', '0001_preferencias', '0002_condicionantes']);
      expect(journal.entries[2].when).toBeGreaterThan(journal.entries[1].when);
    });

    it('o SQL só cria objetos novos: nada de DROP, RENAME ou ALTER de colunas existentes', () => {
      const sqlMigracao = readFileSync(path.resolve('src/lib/db/migrations/0002_condicionantes.sql'), 'utf8');
      expect(sqlMigracao).not.toMatch(/\bDROP\b|\bRENAME\b|ALTER COLUMN|TRUNCATE|DELETE FROM|UPDATE\s+"/i);
      const alterados = [...sqlMigracao.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]);
      expect(new Set(alterados)).toEqual(new Set(['condicionantes', 'condicionante_cumprimentos']));
    });

    it('cria as duas tabelas com as colunas previstas', async () => {
      const { rows } = await pool.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('condicionantes', 'condicionante_cumprimentos')
         ORDER BY table_name, ordinal_position`);
      const colunas = (tabela: string) => rows.filter((r) => r.table_name === tabela).map((r) => r.column_name);
      expect(colunas('condicionantes')).toEqual(['id', 'licenca_id', 'codigo', 'descricao', 'categoria', 'responsavel',
        'periodicidade', 'prazo_inicial', 'prazo', 'calendario', 'ciclo', 'status', 'ultimo_cumprimento_em', 'observacao',
        'criado_em', 'atualizado_em']);
      expect(colunas('condicionante_cumprimentos')).toEqual(['id', 'condicionante_id', 'calendario', 'ciclo',
        'prazo_referencia', 'cumprida_em', 'observacao', 'registrado_por', 'registrado_em', 'cancelado_em', 'cancelado_por',
        'motivo_cancelamento']);
    });

    it('não mexeu nas tabelas existentes: licencas continua com as mesmas colunas', async () => {
      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'licencas' ORDER BY ordinal_position`);
      expect(rows.map((r) => r.column_name)).toEqual(['id', 'usina_id', 'tipo', 'emissor', 'numero', 'data_validade', 'observacao']);
    });
  });

  describe('2. Condicionantes', () => {
    it('valores padrão: pendente, calendário 1, ciclo 0 e datas de auditoria', async () => {
      const c = await condicionante();
      expect(c).toMatchObject({ status: 'pendente', calendario: 1, ciclo: 0, ultimoCumprimentoEm: null });
      expect(c.criadoEm).toBeInstanceOf(Date);
      expect(c.atualizadoEm).toBeInstanceOf(Date);
    });

    it('precisa de uma licença existente', async () => {
      await falha(condicionante({ licencaId: '00000000-0000-4000-8000-000000000000' }), '23503', 'condicionantes_licenca_id_fkey');
    });

    it('licença com condicionante não pode ser excluída (RESTRICT)', async () => {
      await condicionante({ licencaId: licencaB });
      await falha(banco.delete(schema.licencas).where(orm.eq(schema.licencas.id, licencaB)), ['23001', '23503'], 'condicionantes_licenca_id_fkey');
    });

    it('código é único por licença, sem diferenciar maiúsculas', async () => {
      await condicionante({ codigo: 'Cond. 7' });
      await falha(condicionante({ codigo: 'COND. 7' }), '23505', 'condicionantes_codigo_unico');
      await expect(condicionante({ codigo: 'cond. 7', licencaId: licencaB })).resolves.toBeDefined();
    });

    it('categoria, periodicidade e status aceitam só os valores previstos', async () => {
      const base = `INSERT INTO condicionantes (licenca_id, codigo, descricao, categoria, responsavel, periodicidade, prazo_inicial, prazo, status)
        VALUES ($1, $2, 'D', $3, 'R', $4, '2027-01-01', '2027-01-01', $5)`;
      const codigo = () => `E-${randomBytes(3).toString('hex')}`;
      await falha(pool.query(base, [licencaA, codigo(), 'inventada', 'mensal', 'pendente']), '22P02');
      await falha(pool.query(base, [licencaA, codigo(), 'relatorio', 'diaria', 'pendente']), '22P02');
      await falha(pool.query(base, [licencaA, codigo(), 'relatorio', 'mensal', 'atrasada']), '22P02');
      for (const status of ['pendente', 'em_andamento', 'encerrada'] as const) {
        await expect(condicionante({ status })).resolves.toMatchObject({ status });
      }
    });

    it('textos obrigatórios não podem ser só espaços', async () => {
      await falha(condicionante({ codigo: '   ' }), '23514', 'condicionantes_textos_check');
      await falha(condicionante({ descricao: ' ' }), '23514', 'condicionantes_textos_check');
      await falha(condicionante({ responsavel: '' }), '23514', 'condicionantes_textos_check');
    });

    it('ciclo não pode ser negativo, calendário começa em 1 e o prazo não volta antes da âncora', async () => {
      await falha(condicionante({ ciclo: -1 }), '23514', 'condicionantes_contadores_check');
      await falha(condicionante({ calendario: 0 }), '23514', 'condicionantes_contadores_check');
      await falha(condicionante({ prazo: '2027-01-30' }), '23514', 'condicionantes_prazo_check');
    });

    it('periódica nunca fica "cumprida": cumprir avança o prazo e ela volta a pendente', async () => {
      await falha(condicionante({ status: 'cumprida', ultimoCumprimentoEm: '2027-01-30' }), '23514', 'condicionantes_cumprida_check');
      await expect(condicionante({ ciclo: 1, prazo: '2027-02-28', ultimoCumprimentoEm: '2027-01-30' }))
        .resolves.toMatchObject({ status: 'pendente', ciclo: 1 });
    });

    it('única: "cumprida" exige ciclo 1 e a data do cumprimento; o prazo nunca muda', async () => {
      const unica = { periodicidade: 'unica' as const };
      await expect(condicionante({ ...unica, status: 'cumprida', ciclo: 1, ultimoCumprimentoEm: '2027-01-30' }))
        .resolves.toMatchObject({ status: 'cumprida' });
      await falha(condicionante({ ...unica, status: 'cumprida', ciclo: 1 }), '23514', 'condicionantes_cumprida_check');
      await falha(condicionante({ ...unica, status: 'cumprida', ciclo: 0, ultimoCumprimentoEm: '2027-01-30' }), '23514', 'condicionantes_unica_check');
      await falha(condicionante({ ...unica, ciclo: 1 }), '23514', 'condicionantes_unica_check');
      await falha(condicionante({ ...unica, ciclo: 2 }), '23514', 'condicionantes_unica_check');
      await falha(condicionante({ ...unica, prazo: '2027-02-28' }), '23514', 'condicionantes_unica_check');
    });
  });

  describe('3. Histórico de cumprimentos', () => {
    it('precisa de condicionante e de quem registrou; nenhum dos dois pode ser apagado depois', async () => {
      const c = await condicionante();
      await falha(cumprimento('00000000-0000-4000-8000-000000000000'), '23503', 'condicionante_cumprimentos_condicionante_id_fkey');
      await falha(cumprimento(c.id, { registradoPor: '00000000-0000-4000-8000-000000000000' }), '23503',
        'condicionante_cumprimentos_registrado_por_fkey');
      await falha(pool.query(`INSERT INTO condicionante_cumprimentos (condicionante_id, calendario, ciclo, prazo_referencia, cumprida_em)
        VALUES ($1, 1, 0, '2027-01-31', '2027-01-30')`, [c.id]), '23502');
      await cumprimento(c.id);
      await falha(banco.delete(schema.condicionantes).where(orm.eq(schema.condicionantes.id, c.id)), ['23001', '23503'],
        'condicionante_cumprimentos_condicionante_id_fkey');
      await falha(banco.delete(schema.usuarios).where(orm.eq(schema.usuarios.id, pessoa)), ['23001', '23503'],
        'condicionante_cumprimentos_registrado_por_fkey');
    });

    it('o mesmo período não pode ser cumprido duas vezes', async () => {
      const c = await condicionante();
      await cumprimento(c.id);
      await falha(cumprimento(c.id, { cumpridaEm: '2027-01-31' }), '23505', 'condicionante_cumprimentos_periodo_unico');
      await expect(cumprimento(c.id, { ciclo: 1, prazoReferencia: '2027-02-28' })).resolves.toBeDefined();
    });

    it('desfazer = cancelar: o registro fica guardado e o período pode ser cumprido de novo', async () => {
      const c = await condicionante();
      const original = await cumprimento(c.id, { observacao: 'protocolo 1' });
      await cancelamento(original.id);
      const refeito = await cumprimento(c.id, { cumpridaEm: '2027-01-31', observacao: 'protocolo 2' });
      // Um segundo cumprimento ativo do mesmo período continua proibido.
      await falha(cumprimento(c.id), '23505', 'condicionante_cumprimentos_periodo_unico');
      // Cancelar de novo e refazer: o banco guarda todos os cancelados.
      await cancelamento(refeito.id, 'Data informada errada');
      await cumprimento(c.id, { cumpridaEm: '2027-01-29' });
      const historico = await banco.select().from(schema.condicionanteCumprimentos)
        .where(orm.eq(schema.condicionanteCumprimentos.condicionanteId, c.id));
      expect(historico).toHaveLength(3);
      expect(historico.filter((h) => h.canceladoEm === null)).toHaveLength(1);
      expect(historico.find((h) => h.id === original.id)).toMatchObject({
        observacao: 'protocolo 1', canceladoPor: pessoa, motivoCancelamento: 'Registrado na condicionante errada',
      });
    });

    it('cancelamento é tudo ou nada: data, quem cancelou e motivo', async () => {
      const c = await condicionante();
      const tabela = schema.condicionanteCumprimentos;
      const alvo = await cumprimento(c.id);
      const tentar = (campos: CamposCumprimento) => banco.update(tabela).set(campos).where(orm.eq(tabela.id, alvo.id));
      const depois = new Date(Date.now() + 1000);
      const regra = 'condicionante_cumprimentos_cancelamento_check';
      await falha(tentar({ canceladoEm: depois, canceladoPor: pessoa }), '23514', regra);
      await falha(tentar({ canceladoEm: depois, motivoCancelamento: 'sem autor' }), '23514', regra);
      await falha(tentar({ motivoCancelamento: 'sem data', canceladoPor: pessoa }), '23514', regra);
      await falha(tentar({ canceladoEm: depois, canceladoPor: pessoa, motivoCancelamento: '   ' }), '23514', regra);
      await falha(tentar({ canceladoEm: new Date(alvo.registradoEm.getTime() - 60_000), canceladoPor: pessoa, motivoCancelamento: 'antes do registro' }),
        '23514', regra);
      await falha(tentar({ canceladoEm: depois, canceladoPor: '00000000-0000-4000-8000-000000000000', motivoCancelamento: 'x' }),
        '23503', 'condicionante_cumprimentos_cancelado_por_fkey');
    });

    it('calendário reiniciado: períodos novos não colidem com os antigos, nem com a mesma data', async () => {
      const c = await condicionante();
      await cumprimento(c.id, { calendario: 1, ciclo: 0, prazoReferencia: '2027-01-31' });
      await cumprimento(c.id, { calendario: 1, ciclo: 1, prazoReferencia: '2027-02-28' });
      // Reinício com âncora numa data já cumprida no calendário antigo.
      await banco.update(schema.condicionantes)
        .set({ calendario: 2, ciclo: 0, prazoInicial: '2027-02-28', prazo: '2027-02-28' })
        .where(orm.eq(schema.condicionantes.id, c.id));
      await expect(cumprimento(c.id, { calendario: 2, ciclo: 0, prazoReferencia: '2027-02-28' })).resolves.toBeDefined();
      await falha(cumprimento(c.id, { calendario: 2, ciclo: 0, prazoReferencia: '2027-02-28' }), '23505',
        'condicionante_cumprimentos_periodo_unico');
      const historico = await banco.select().from(schema.condicionanteCumprimentos)
        .where(orm.eq(schema.condicionanteCumprimentos.condicionanteId, c.id));
      expect(historico.map((h) => `${h.calendario}/${h.ciclo}/${h.prazoReferencia}`).sort())
        .toEqual(['1/0/2027-01-31', '1/1/2027-02-28', '2/0/2027-02-28']);
    });

    it('contadores do histórico: calendário a partir de 1 e ciclo não negativo', async () => {
      const c = await condicionante();
      await falha(cumprimento(c.id, { calendario: 0 }), '23514', 'condicionante_cumprimentos_contadores_check');
      await falha(cumprimento(c.id, { ciclo: -1 }), '23514', 'condicionante_cumprimentos_contadores_check');
    });
  });

  describe('4. Trava contra migrar o banco errado (drizzle.config.ts)', () => {
    // Banco falso numa porta fechada: mesmo se a trava falhar, nada é alterado.
    const FALSO = 'postgresql://ninguem:nada@127.0.0.1:1/banco_de_producao';
    const drizzleKit = (comando: string, env: Record<string, string>) => executar(process.execPath,
      [path.resolve('node_modules/drizzle-kit/bin.cjs'), comando],
      { env: { ...process.env, ...env }, timeout: 60_000 }).then(
      (r) => ({ ok: true, saida: r.stdout + r.stderr }),
      (e: { stdout?: string; stderr?: string }) => ({ ok: false, saida: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
    const semConfirmacao = { DATABASE_URL: FALSO, CONFIRMO_BACKUP: '' };

    it('recusa "migrate" e "push" fora do solaria_test sem CONFIRMO_BACKUP', async () => {
      for (const comando of ['migrate', 'push']) {
        const r = await drizzleKit(comando, semConfirmacao);
        expect(r.ok).toBe(false);
        expect(r.saida).toContain('[trava]');
        expect(r.saida).toContain('CONFIRMO_BACKUP=banco_de_producao');
      }
    }, 120_000);

    it('a confirmação precisa repetir o nome exato do banco', async () => {
      const r = await drizzleKit('migrate', { DATABASE_URL: FALSO, CONFIRMO_BACKUP: 'sim' });
      expect(r.saida).toContain('[trava]');
      const confirmado = await drizzleKit('migrate', { DATABASE_URL: FALSO, CONFIRMO_BACKUP: 'banco_de_producao' });
      expect(confirmado.ok).toBe(false); // falha ao conectar na porta fechada, não na trava
      expect(confirmado.saida).not.toContain('[trava]');
    }, 120_000);
  });
});
