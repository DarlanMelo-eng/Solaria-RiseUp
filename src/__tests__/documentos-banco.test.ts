import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularSha256 } from '@/lib/armazenamento';

/*
 * Estrutura de documentos (Lote 13): migração 0003, restrições e triggers de coerência e integridade.
 * Só o banco, sem API. Roda no banco de TESTE (TEST_DATABASE_URL).
 */

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const NAO_EXISTE = '00000000-0000-4000-8000-000000000000';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1');

function erroPostgres(e: unknown): { code?: string; constraint?: string } {
  if (!e || typeof e !== 'object') return {};
  if ('code' in e && typeof e.code === 'string') return e as { code: string; constraint?: string };
  return 'cause' in e ? erroPostgres(e.cause) : {};
}
async function falha(promessa: Promise<unknown>, codigos: string | string[], constraint?: string) {
  const erro = await promessa.then(() => null, (e: unknown) => erroPostgres(e));
  expect(erro, 'a operação deveria ter sido recusada pelo banco').not.toBeNull();
  expect([codigos].flat()).toContain(erro?.code);
  if (constraint) expect(erro?.constraint).toBe(constraint);
}

testar('Estrutura de documentos', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let orm: typeof import('drizzle-orm');
  const ids = { usinas: [] as string[], usuarios: [] as string[] };
  let usinaA: string;
  let usinaB: string;
  let licencaA: string;
  let licencaB: string;
  let condA: string;
  let condB: string;
  let pessoa: string;

  type Campos = Partial<typeof import('@/lib/db/schema').documentos.$inferInsert>;
  const metadados = (conteudo: Buffer, campos: Campos = {}) => ({
    usinaId: usinaA, titulo: 'Relatório de monitoramento', tipo: 'relatorio' as const, nomeArquivo: 'relatorio.pdf',
    mime: 'application/pdf', tamanhoBytes: conteudo.length, sha256: calcularSha256(conteudo), enviadoPor: pessoa, ...campos,
  });
  /** Como a API vai gravar: metadados e conteúdo na mesma transação. */
  function documento(campos: Campos = {}, conteudo: Buffer = PDF, conteudoGravado: Buffer = conteudo) {
    return banco.transaction(async (tx) => {
      const [d] = await tx.insert(schema.documentos).values(metadados(conteudo, campos)).returning();
      await tx.insert(schema.documentosConteudo).values({ documentoId: d.id, dados: conteudoGravado });
      return d;
    });
  }
  const conteudoDe = async (id: string) =>
    (await banco.select().from(schema.documentosConteudo).where(orm.eq(schema.documentosConteudo.documentoId, id)))[0];

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

    const sufixo = randomBytes(4).toString('hex');
    [usinaA, usinaB] = (await banco.insert(schema.usinas).values([
      { nome: `Usina doc A ${sufixo}`, localizacao: 'Teste, PE', capacidadeKwp: 10, status: 'ativa' },
      { nome: `Usina doc B ${sufixo}`, localizacao: 'Teste, PE', capacidadeKwp: 10, status: 'ativa' },
    ]).returning()).map((u) => u.id);
    ids.usinas.push(usinaA, usinaB);
    const lic = (usinaId: string, numero: string) => ({ usinaId, tipo: 'Licença de Operação', emissor: 'Órgão', numero, dataValidade: '2031-01-01' });
    [licencaA, licencaB] = (await banco.insert(schema.licencas).values([lic(usinaA, 'LO-DA'), lic(usinaB, 'LO-DB')]).returning()).map((l) => l.id);
    const cond = (licencaId: string, codigo: string) => ({
      licencaId, codigo, descricao: 'Relatório', categoria: 'relatorio' as const, responsavel: 'Equipe',
      periodicidade: 'anual' as const, prazoInicial: '2027-01-01', prazo: '2027-01-01',
    });
    [condA, condB] = (await banco.insert(schema.condicionantes).values([cond(licencaA, 'D-A'), cond(licencaB, 'D-B')]).returning()).map((c) => c.id);
    const [u] = await banco.insert(schema.usuarios).values({ email: `doc-${sufixo}@example.test`, nome: 'Quem enviou', papel: 'gestor', senhaHash: 'nao-usado' }).returning();
    pessoa = u.id;
    ids.usuarios.push(pessoa);
  });

  afterAll(async () => {
    if (!pool) return;
    // documentos_conteudo sai em cascata com o documento.
    await banco.delete(schema.documentos).where(orm.inArray(schema.documentos.usinaId, ids.usinas));
    await banco.delete(schema.condicionantes).where(orm.inArray(schema.condicionantes.id, [condA, condB].filter(Boolean)));
    await banco.delete(schema.licencas).where(orm.inArray(schema.licencas.usinaId, ids.usinas));
    await banco.delete(schema.usinas).where(orm.inArray(schema.usinas.id, ids.usinas));
    await banco.delete(schema.usuarios).where(orm.inArray(schema.usuarios.id, ids.usuarios));
    await pool.end();
  });

  describe('1. Migração 0003', () => {
    const sql0003 = () => readFileSync(path.resolve('src/lib/db/migrations/0003_documentos.sql'), 'utf8');

    it('é incremental: o journal mantém 0000 a 0002 e acrescenta só a 0003', () => {
      const journal = JSON.parse(readFileSync(path.resolve('src/lib/db/migrations/meta/_journal.json'), 'utf8'));
      // As quatro primeiras, nesta ordem; migrações posteriores podem vir depois.
      expect(journal.entries.slice(0, 4).map((e: { tag: string }) => e.tag)).toEqual(['0000_inicial', '0001_preferencias', '0002_condicionantes', '0003_documentos']);
      expect(journal.entries[3].when).toBeGreaterThan(journal.entries[2].when);
    });

    it('só cria objetos novos: nada de DROP, RENAME, ALTER COLUMN, e só toca nas tabelas novas', () => {
      const s = sql0003();
      expect(s).not.toMatch(/\bDROP\b|\bRENAME\b|ALTER COLUMN|TRUNCATE|DELETE FROM|UPDATE\s+"/i);
      const alteradas = [...s.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]);
      expect(new Set(alteradas)).toEqual(new Set(['documentos', 'documentos_conteudo']));
      const comTrigger = [...s.matchAll(/(?:BEFORE|AFTER) [A-Z ]+ ON "public"\."([a-z_]+)"/g)].map((m) => m[1]);
      expect(new Set(comTrigger)).toEqual(new Set(['documentos', 'documentos_conteudo']));
    });

    it('cria as tabelas previstas e não muda as existentes', async () => {
      const colunas = async (tabela: string) => (await pool.query<{ column_name: string }>(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position', ['public', tabela]))
        .rows.map((r) => r.column_name);
      expect(await colunas('documentos')).toEqual(['id', 'usina_id', 'licenca_id', 'condicionante_id', 'titulo', 'tipo', 'nome_arquivo',
        'mime', 'tamanho_bytes', 'sha256', 'validade', 'enviado_por', 'criado_em', 'atualizado_em']);
      expect(await colunas('documentos_conteudo')).toEqual(['documento_id', 'dados']);
      expect(await colunas('licencas')).toEqual(['id', 'usina_id', 'tipo', 'emissor', 'numero', 'data_validade', 'observacao']);
      const { rows } = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'condicionantes'");
      expect(rows[0].n).toBe(16);
    });
  });

  describe('2. Gravação e vínculos', () => {
    it('grava só com a usina, com a licença, ou com licença e condicionante; os bytes voltam iguais', async () => {
      const soUsina = await documento();
      const comLicenca = await documento({ licencaId: licencaA, tipo: 'licenca' });
      const completo = await documento({ licencaId: licencaA, condicionanteId: condA, tipo: 'comprovante', validade: '2027-12-31' });
      expect(soUsina).toMatchObject({ licencaId: null, condicionanteId: null, validade: null });
      expect(comLicenca.licencaId).toBe(licencaA);
      expect(completo).toMatchObject({ condicionanteId: condA, validade: '2027-12-31' });
      const lido = await conteudoDe(completo.id);
      expect(Buffer.compare(lido.dados, PDF)).toBe(0);
      expect(calcularSha256(lido.dados)).toBe(completo.sha256);
    });

    it('arquivo de exatamente 8 MB grava e volta íntegro', async () => {
      const grande = Buffer.alloc(8 * 1024 * 1024, 0x41);
      PDF.copy(grande);
      const d = await documento({ tamanhoBytes: grande.length }, grande);
      expect(calcularSha256((await conteudoDe(d.id)).dados)).toBe(calcularSha256(grande));
    }, 60_000);

    it('chaves estrangeiras: usina, licença, condicionante e quem enviou precisam existir', async () => {
      await falha(documento({ usinaId: NAO_EXISTE }), '23503', 'documentos_usina_id_fkey');
      await falha(documento({ licencaId: NAO_EXISTE }), '23503', 'documentos_licenca_id_fkey');
      await falha(documento({ licencaId: licencaA, condicionanteId: NAO_EXISTE }), '23503', 'documentos_condicionante_id_fkey');
      await falha(documento({ enviadoPor: NAO_EXISTE }), '23503', 'documentos_enviado_por_fkey');
    });

    it('vínculos incoerentes são recusados', async () => {
      await falha(documento({ licencaId: licencaB }), '23514', 'documentos_licenca_da_usina');
      await falha(documento({ licencaId: licencaA, condicionanteId: condB }), '23514', 'documentos_condicionante_da_licenca');
      await falha(documento({ condicionanteId: condA }), '23514', 'documentos_condicionante_com_licenca_check');
      await falha(documento({ usinaId: usinaB, licencaId: licencaA, condicionanteId: condA }), '23514', 'documentos_licenca_da_usina');
    });

    it('a coerência vale também na edição', async () => {
      const d = await documento({ licencaId: licencaA });
      const editar = (campos: Campos) => banco.update(schema.documentos).set(campos).where(orm.eq(schema.documentos.id, d.id));
      await falha(editar({ licencaId: licencaB }), '23514', 'documentos_licenca_da_usina');
      await falha(editar({ condicionanteId: condB }), '23514', 'documentos_condicionante_da_licenca');
      await expect(editar({ condicionanteId: condA })).resolves.toBeDefined();
    });
  });

  describe('3. Restrições dos metadados', () => {
    it('tipo do arquivo, tamanho, SHA-256 e textos', async () => {
      await falha(documento({ mime: 'text/html' }), '23514', 'documentos_mime_check');
      await falha(documento({ tamanhoBytes: 0 }, Buffer.alloc(0), PDF), '23514', 'documentos_tamanho_check');
      await falha(documento({ tamanhoBytes: 8 * 1024 * 1024 + 1 }), '23514', 'documentos_tamanho_check');
      await falha(documento({ sha256: calcularSha256(PDF).toUpperCase() }), '23514', 'documentos_sha256_check');
      await falha(documento({ sha256: 'abc' }), '23514', 'documentos_sha256_check');
      await falha(documento({ titulo: '   ' }), '23514', 'documentos_textos_check');
      await falha(documento({ nomeArquivo: ' ' }), '23514', 'documentos_textos_check');
    });

    it('tipo de documento aceita só os valores previstos', async () => {
      await falha(pool.query(`INSERT INTO documentos (usina_id, titulo, tipo, nome_arquivo, mime, tamanho_bytes, sha256, enviado_por)
        VALUES ($1, 'T', 'contrato', 'a.pdf', 'application/pdf', 1, $2, $3)`, [usinaA, calcularSha256(PDF), pessoa]), '22P02');
    });
  });

  describe('4. Integridade entre metadados e conteúdo', () => {
    it('conteúdo com tamanho ou SHA-256 diferentes do registrado é recusado (e nada fica gravado)', async () => {
      const outro = Buffer.from('%PDF-1.7\noutro conteudo\n', 'latin1');
      await falha(documento({}, PDF, outro), '23514', 'documentos_conteudo_confere');
      const mesmoTamanho = Buffer.from(PDF);
      mesmoTamanho[12] ^= 1;
      await falha(documento({}, PDF, mesmoTamanho), '23514', 'documentos_conteudo_confere');
      const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM documentos WHERE sha256 = $1 AND usina_id = $2 AND titulo = $3',
        [calcularSha256(PDF), usinaA, 'nunca gravado']);
      expect(rows[0].n).toBe(0);
    });

    it('documento sem conteúdo não chega ao fim da transação', async () => {
      await falha(banco.transaction(async (tx) => {
        await tx.insert(schema.documentos).values(metadados(PDF, { titulo: 'Sem arquivo' }));
      }), '23514', 'documentos_com_conteudo');
      // Fora de transação explícita, também.
      await falha(banco.insert(schema.documentos).values(metadados(PDF, { titulo: 'Sem arquivo 2' })), '23514', 'documentos_com_conteudo');
      const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM documentos WHERE titulo LIKE 'Sem arquivo%'");
      expect(rows[0].n).toBe(0);
    });

    it('apagar só o conteúdo é recusado; apagar o documento leva o conteúdo junto', async () => {
      const d = await documento();
      await falha(banco.delete(schema.documentosConteudo).where(orm.eq(schema.documentosConteudo.documentoId, d.id)), '23514', 'documentos_com_conteudo');
      expect(await conteudoDe(d.id)).toBeDefined();
      await banco.delete(schema.documentos).where(orm.eq(schema.documentos.id, d.id));
      expect(await conteudoDe(d.id)).toBeUndefined();
    });

    it('o arquivo é imutável; título, tipo e validade podem mudar', async () => {
      const d = await documento();
      const editar = (campos: Campos) => banco.update(schema.documentos).set(campos).where(orm.eq(schema.documentos.id, d.id));
      for (const campos of [{ sha256: calcularSha256(Buffer.from('x')) }, { tamanhoBytes: 99 }, { mime: 'image/png' }, { nomeArquivo: 'outro.pdf' }]) {
        await falha(editar(campos), '23514', 'documentos_arquivo_imutavel');
      }
      await falha(banco.update(schema.documentosConteudo).set({ dados: PDF }).where(orm.eq(schema.documentosConteudo.documentoId, d.id)),
        '23514', 'documentos_arquivo_imutavel');
      await expect(editar({ titulo: 'Título novo', tipo: 'laudo', validade: '2028-01-01', atualizadoEm: new Date() })).resolves.toBeDefined();
    });
  });

  describe('5. Exclusões bloqueadas (RESTRICT)', () => {
    it('licença, condicionante, usina e quem enviou não podem ser apagados enquanto houver documento', async () => {
      // 23503 até o PostgreSQL 17; 23001 a partir do 18.
      const bloqueio = ['23503', '23001'];
      await documento({ licencaId: licencaA, condicionanteId: condA });
      await falha(banco.delete(schema.condicionantes).where(orm.eq(schema.condicionantes.id, condA)), bloqueio, 'documentos_condicionante_id_fkey');
      await falha(banco.delete(schema.licencas).where(orm.eq(schema.licencas.id, licencaA)), bloqueio);
      await falha(banco.delete(schema.usinas).where(orm.eq(schema.usinas.id, usinaA)), bloqueio);
      await falha(banco.delete(schema.usuarios).where(orm.eq(schema.usuarios.id, pessoa)), bloqueio, 'documentos_enviado_por_fkey');
    });
  });
});
