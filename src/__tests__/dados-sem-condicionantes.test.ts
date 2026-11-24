import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/*
 * Correção do Lote 11: buscarDados() num banco SEM a migração 0002 (sem a tabela condicionantes).
 * Simulado DENTRO do solaria_test: um schema temporário com cópias vazias das tabelas antigas e sem
 * `condicionantes`. A aplicação o enxerga porque a conexão deste arquivo usa search_path = esse schema.
 * O cenário "com a tabela" é coberto por condicionantes-dados.test.ts (schema public).
 */

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const ORIGEM = 'http://localhost:3000';
const ESQUEMA = 'lote11_sem_0002';

testar('/api/dados num banco ainda sem a migração 0002', () => {
  let apoio: Pool; // conexão normal (schema public), só para preparar e limpar
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let buscarDados: typeof import('@/lib/consultas').buscarDados;
  let dadosGET: typeof import('@/app/api/dados/route').GET;
  let cookie: string;
  const sql = (texto: string) => apoio.query(texto);
  const codigoDoErro = (e: unknown) => (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;

  beforeAll(async () => {
    const urlTeste = process.env.TEST_DATABASE_URL;
    if (!urlTeste || urlTeste === process.env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL deve apontar para banco isolado de DATABASE_URL.');
    }
    apoio = new Pool({ connectionString: urlTeste, max: 2 });
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(drizzle(apoio), { migrationsFolder: './src/lib/db/migrations' }); // public completo, como nos outros testes
    await sql(`DROP SCHEMA IF EXISTS ${ESQUEMA} CASCADE`);
    await sql(`CREATE SCHEMA ${ESQUEMA}`);
    // Estado do banco principal hoje: as tabelas antigas existem, `condicionantes` não.
    for (const tabela of ['usuarios', 'usinas', 'licencas', 'manutencoes']) {
      await sql(`CREATE TABLE ${ESQUEMA}.${tabela} (LIKE public.${tabela} INCLUDING ALL)`);
    }

    const separador = urlTeste.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${urlTeste}${separador}options=${encodeURIComponent(`-c search_path=${ESQUEMA}`)}`;
    process.env.DATABASE_SSL = 'false';
    process.env.APP_URL = ORIGEM;
    process.env.SESSION_SECRET = randomBytes(32).toString('base64');
    ({ pool, banco } = await import('@/lib/db'));
    schema = await import('@/lib/db/schema');
    ({ buscarDados } = await import('@/lib/consultas'));
    ({ GET: dadosGET } = await import('@/app/api/dados/route'));

    // Confere que a conexão da aplicação enxerga só o schema temporário.
    const { rows } = await pool.query<{ caminho: string; falta: boolean }>(
      "SELECT current_setting('search_path') AS caminho, to_regclass('condicionantes') IS NULL AS falta");
    expect(rows[0]).toEqual({ caminho: ESQUEMA, falta: true });

    const [usina] = await banco.insert(schema.usinas).values({ nome: 'Usina sem 0002', localizacao: 'Teste, PE', capacidadeKwp: 10, status: 'ativa' }).returning();
    await banco.insert(schema.licencas).values({ usinaId: usina.id, tipo: 'Licença de Operação', emissor: 'Órgão', numero: 'LO-S', dataValidade: '2030-01-01' });
    await banco.insert(schema.manutencoes).values({ usinaId: usina.id, titulo: 'Limpeza dos painéis', responsavel: 'Equipe', prazo: '2027-01-10', prioridade: 'media', status: 'pendente' });
    const email = `sem0002-${randomBytes(4).toString('hex')}@example.test`;
    const [u] = await banco.insert(schema.usuarios).values({ email, nome: 'Pessoa consulta', papel: 'consulta', senhaHash: 'nao-usado' }).returning();
    const { criarToken } = await import('@/lib/sessao');
    cookie = await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel: 'consulta' });
  });

  afterAll(async () => {
    await pool?.end();
    if (apoio) {
      await sql(`DROP SCHEMA IF EXISTS ${ESQUEMA} CASCADE`);
      await apoio.end();
    }
  });

  it('sem a tabela: condicionantes vazias, o resto normal, e um único aviso no log do servidor', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dados = await buscarDados();
    expect(dados.condicionantes).toEqual([]);
    expect(dados.usinas.map((u) => u.nome)).toEqual(['Usina sem 0002']);
    expect(dados.licencas.map((l) => l.numero)).toEqual(['LO-S']);
    expect(dados.manutencoes.map((m) => m.titulo)).toEqual(['Limpeza dos painéis']);
    await buscarDados();
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0][0]).toMatch(/migração 0002 pendente/);
    aviso.mockRestore();
  });

  it('/api/dados (o mesmo usado pelas telas antigas) responde 200, com condicionantes vazias', async () => {
    const r = await dadosGET(new NextRequest(`${ORIGEM}/api/dados`, { headers: { cookie: `solaria_session=${cookie}` } }));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(Object.keys(corpo).sort()).toEqual(['condicionantes', 'licencas', 'manutencoes', 'usinas']);
    expect(corpo.condicionantes).toEqual([]);
    expect(corpo.usinas).toHaveLength(1);
  });

  it('outra tabela ausente NÃO é escondida: continua sendo erro (42P01)', async () => {
    await sql(`ALTER TABLE ${ESQUEMA}.manutencoes RENAME TO manutencoes_fora`);
    try {
      const erro = await buscarDados().then(() => null, (e: unknown) => e);
      expect(codigoDoErro(erro)).toBe('42P01');
    } finally {
      await sql(`ALTER TABLE ${ESQUEMA}.manutencoes_fora RENAME TO manutencoes`);
    }
  });

  it('erro de permissão (42501) na consulta de condicionantes NÃO é escondido', async () => {
    // REVOKE SELECT não simula falta de permissão quando TEST_DATABASE_URL usa
    // um superusuário (como postgres). Injetar o erro apenas na consulta nova
    // verifica a propagação sem modificar privilégios ou objetos no banco.
    const consultaOriginal = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
    let simulouPermissao = false;
    const espionagem = vi.spyOn(pool, 'query').mockImplementation(((...args: unknown[]) => {
      const entrada = args[0];
      const texto = typeof entrada === 'string'
        ? entrada
        : entrada && typeof entrada === 'object' && 'text' in entrada
          ? String(entrada.text)
          : '';
      if (/\bfrom\s+"condicionantes"/i.test(texto)) {
        simulouPermissao = true;
        return Promise.reject(Object.assign(new Error('permission denied for table condicionantes'), { code: '42501' }));
      }
      return consultaOriginal(...args);
    }) as typeof pool.query);
    try {
      const erro = await buscarDados().then(() => null, (e: unknown) => e);
      expect(simulouPermissao, 'a consulta de condicionantes deve receber o erro simulado').toBe(true);
      expect(erro, 'buscarDados deve propagar o erro 42501').not.toBeNull();
      expect(codigoDoErro(erro)).toBe('42501');
    } finally {
      espionagem.mockRestore();
    }
  });

  it('depois de criada a tabela, as condicionantes voltam a ser listadas normalmente', async () => {
    await sql(`CREATE TABLE ${ESQUEMA}.condicionantes (LIKE public.condicionantes INCLUDING ALL)`);
    try {
      const [licenca] = await banco.select().from(schema.licencas);
      await banco.insert(schema.condicionantes).values({
        licencaId: licenca.id, codigo: 'C-1', descricao: 'Relatório anual', categoria: 'relatorio', responsavel: 'Equipe',
        periodicidade: 'anual', prazoInicial: '2027-06-30', prazo: '2027-06-30',
      });
      const dados = await buscarDados();
      expect(dados.condicionantes).toHaveLength(1);
      expect(dados.condicionantes[0]).toMatchObject({ codigo: 'C-1', prazo: '2027-06-30', periodicidade: 'anual', status: 'pendente' });
    } finally {
      await sql(`DROP TABLE ${ESQUEMA}.condicionantes`);
    }
  });
});
