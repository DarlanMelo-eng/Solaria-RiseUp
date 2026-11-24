import { randomBytes } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { Tabela, type ColumnDef } from '@/components/tabela';
import type { Condicionante, Papel } from '@/types/solar';
import {
  ROTULO_CATEGORIA, ROTULO_PERIODICIDADE, ROTULO_SITUACAO, ROTULO_STATUS_CONDICIONANTE, situacaoCondicionante,
} from '@/utils/periodicidade';

/*
 * Lote 11: condicionantes nos dados centrais (/api/dados), situação para a interface e o
 * componente reutilizável de tabela (TanStack Table). Integração só no banco de TESTE.
 */

describe('Situação da condicionante (para a interface)', () => {
  const agora = new Date(2027, 0, 10, 12); // 10/01/2027, meio-dia no fuso local
  const s = (prazo: string, status: Condicionante['status'] = 'pendente') => situacaoCondicionante({ prazo, status }, agora);

  it('vencida, a vencer (até 15 dias, como as licenças) e em dia', () => {
    expect(s('2027-01-09')).toBe('vencida');
    expect(s('2027-01-10')).toBe('a_vencer'); // vence hoje
    expect(s('2027-01-25')).toBe('a_vencer'); // 15 dias
    expect(s('2027-01-26')).toBe('em_dia'); // 16 dias
    expect(s('2027-01-09', 'em_andamento')).toBe('vencida');
  });

  it('cumprida (única) e encerrada deixam de ser acompanhadas, mesmo com prazo passado', () => {
    expect(s('2026-01-01', 'cumprida')).toBe('cumprida');
    expect(s('2026-01-01', 'encerrada')).toBe('encerrada');
  });

  it('data inválida conta como vencida (falha segura)', () => {
    expect(s('2027-02-30')).toBe('vencida');
  });

  it('há rótulo em português para todos os valores', () => {
    expect(Object.keys(ROTULO_SITUACAO).sort()).toEqual(['a_vencer', 'cumprida', 'em_dia', 'encerrada', 'vencida']);
    expect(Object.keys(ROTULO_PERIODICIDADE).sort()).toEqual(['anual', 'mensal', 'semestral', 'trimestral', 'unica']);
    expect(Object.keys(ROTULO_CATEGORIA).sort()).toEqual(['compensacao', 'monitoramento', 'operacional', 'outro', 'relatorio']);
    expect(Object.keys(ROTULO_STATUS_CONDICIONANTE).sort()).toEqual(['cumprida', 'em_andamento', 'encerrada', 'pendente']);
  });
});

describe('Componente Tabela (TanStack Table)', () => {
  type Linha = { id: string; numero: number; nome: string };
  const linhas: Linha[] = Array.from({ length: 25 }, (_, i) => ({ id: `l${i}`, numero: i + 1, nome: `Item ${i + 1}` }));
  const colunas: ColumnDef<Linha>[] = [
    { id: 'numero', header: 'Número', accessorFn: (l) => l.numero },
    { id: 'nome', header: 'Nome', accessorFn: (l) => l.nome, cell: ({ row }) => `<${row.original.nome}>` },
    { id: 'acoes', header: 'Ações', cell: () => 'editar', meta: { className: 'w-24' } },
  ];
  const html = (props: Partial<Parameters<typeof Tabela<Linha>>[0]> = {}) => renderToStaticMarkup(createElement(Tabela<Linha>, {
    dados: linhas, colunas, rotulo: 'Lista de teste', idDaLinha: (l) => l.id, ...props,
  }));
  const corpo = (h: string) => h.split('<tbody')[1];

  it('pagina localmente (10 por padrão) e mostra a paginação existente', () => {
    const h = html();
    expect(corpo(h).match(/<tr /g)).toHaveLength(10);
    expect(h).toContain('<caption class="sr-only">Lista de teste</caption>');
    expect(h).toContain('1 / 3');
    expect(h).toContain('&lt;Item 1&gt;'); // célula personalizada, com o texto escapado pelo React
  });

  it('colunas com valor são ordenáveis pelo cabeçalho; a de ações não', () => {
    const h = html();
    const cabecalho = h.split('<tbody')[0];
    expect(cabecalho.match(/<button/g)).toHaveLength(2);
    expect(cabecalho).toMatch(/<th scope="col" class="px-4 py-3 w-24">Ações<\/th>/);
  });

  it('ordenação inicial descendente: a primeira linha é a maior, e o cabeçalho informa aria-sort', () => {
    const h = html({ ordenacaoInicial: [{ id: 'numero', desc: true }], porPagina: 5 });
    expect(corpo(h).match(/<td[^>]*>(\d+)<\/td>/)?.[1]).toBe('25');
    expect(h).toContain('aria-sort="descending"');
    expect(corpo(h).match(/<tr /g)).toHaveLength(5);
  });

  it('sem linhas, mostra o conteúdo de "vazio" no lugar da tabela; poucas linhas não mostram paginação', () => {
    const vazio = html({ dados: [], vazio: createElement('p', null, 'Nenhuma condicionante') });
    expect(vazio).toBe('<p>Nenhuma condicionante</p>');
    const poucas = html({ dados: linhas.slice(0, 3) });
    expect(corpo(poucas).match(/<tr /g)).toHaveLength(3);
    expect(poucas).not.toContain('Paginação de resultados');
  });
});

const disponivel = Boolean(process.env.TEST_DATABASE_URL);
const testar = disponivel ? describe : describe.skip;
const ORIGEM = 'http://localhost:3000';

testar('Condicionantes no /api/dados', () => {
  let pool: typeof import('@/lib/db').pool;
  let banco: typeof import('@/lib/db').banco;
  let schema: typeof import('@/lib/db/schema');
  let orm: typeof import('drizzle-orm');
  let dadosGET: typeof import('@/app/api/dados/route').GET;
  let buscarDados: typeof import('@/lib/consultas').buscarDados;
  let colecao: typeof import('@/app/api/condicionantes/route');
  let item: typeof import('@/app/api/condicionantes/[id]/route');
  let cumprimentos: typeof import('@/app/api/condicionantes/[id]/cumprimentos/route');
  const cookies = {} as Record<Papel, string>;
  const ids = { usuarios: [] as string[], usinas: [] as string[] };
  let licenca: string;
  let licencaInativa: string;

  const requisicao = (caminho: string, metodo: string, papel?: Papel, corpo?: unknown) => new NextRequest(`${ORIGEM}${caminho}`, {
    method: metodo,
    headers: { Origin: ORIGEM, 'Content-Type': 'application/json', ...(papel ? { cookie: `solaria_session=${cookies[papel]}` } : {}) },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const dados = async (papel: Papel = 'consulta') => {
    const r = await dadosGET(requisicao('/api/dados', 'GET', papel));
    expect(r.status).toBe(200);
    return r.json() as Promise<import('@/types/solar').DadosOperacionais>;
  };
  async function nova(campos: Record<string, unknown>): Promise<Condicionante> {
    const r = await colecao.POST(requisicao('/api/condicionantes', 'POST', 'admin', {
      licencaId: licenca, codigo: `D-${randomBytes(3).toString('hex')}`, descricao: 'Relatório de monitoramento',
      categoria: 'monitoramento', responsavel: 'Equipe', periodicidade: 'mensal', prazo: '2027-01-31', ...campos,
    }));
    expect(r.status).toBe(201);
    return r.json();
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
    ({ GET: dadosGET } = await import('@/app/api/dados/route'));
    ({ buscarDados } = await import('@/lib/consultas'));
    colecao = await import('@/app/api/condicionantes/route');
    item = await import('@/app/api/condicionantes/[id]/route');
    cumprimentos = await import('@/app/api/condicionantes/[id]/cumprimentos/route');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(banco, { migrationsFolder: './src/lib/db/migrations' });
    const { criarToken } = await import('@/lib/sessao');
    for (const papel of ['admin', 'consulta'] as const) {
      const email = `dados-${papel}-${randomBytes(4).toString('hex')}@example.test`;
      const [u] = await banco.insert(schema.usuarios).values({ email, nome: `Pessoa ${papel}`, papel, senhaHash: 'nao-usado' }).returning();
      ids.usuarios.push(u.id);
      cookies[papel] = await criarToken({ sub: u.id, v: u.versaoToken, email, nome: u.nome, papel });
    }
    const sufixo = randomBytes(4).toString('hex');
    const [ativa, inativa] = await banco.insert(schema.usinas).values([
      { nome: `Usina dados ${sufixo}`, localizacao: 'Teste, PE', capacidadeKwp: 50, status: 'ativa' },
      { nome: `Usina dados inativa ${sufixo}`, localizacao: 'Teste, PE', capacidadeKwp: 50, status: 'ativa' },
    ]).returning();
    ids.usinas.push(ativa.id, inativa.id);
    const lic = (usinaId: string, numero: string) => ({ usinaId, tipo: 'Licença de Operação', emissor: 'Órgão', numero, dataValidade: '2033-01-01' });
    const [la, li] = await banco.insert(schema.licencas).values([lic(ativa.id, 'LO-D'), lic(inativa.id, 'LO-DI')]).returning();
    licenca = la.id;
    licencaInativa = li.id;
  });

  afterAll(async () => {
    if (!pool) return;
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
    await banco.delete(schema.usuarios).where(orm.inArray(schema.usuarios.id, ids.usuarios));
    await pool.end();
  });

  it('mantém as chaves antigas e acrescenta só "condicionantes"; API e layout usam a mesma consulta', async () => {
    await nova({});
    const d = await dados();
    expect(Object.keys(d).sort()).toEqual(['condicionantes', 'licencas', 'manutencoes', 'usinas']);
    expect(d).toEqual(await buscarDados());
    // Formato das listas antigas não mudou (mesmas chaves de antes do Lote 11).
    const minha = d.licencas.find((l) => l.id === licenca)!;
    expect(Object.keys(minha).sort()).toEqual(['dataValidade', 'emissor', 'id', 'numero', 'tipo', 'usinaId']);
  });

  it('cada condicionante vem no mesmo formato da rota própria, com prazo, periodicidade e status, sem o histórico', async () => {
    const c = await nova({ periodicidade: 'trimestral', prazo: '2027-03-31', observacao: 'Ver ofício' });
    const daLista = (await dados()).condicionantes.find((x) => x.id === c.id);
    const daRota = await (await item.GET(requisicao(`/api/condicionantes/${c.id}`, 'GET', 'consulta'), ctx(c.id))).json();
    expect(daLista).toEqual(daRota);
    expect(daLista).toMatchObject({ prazo: '2027-03-31', periodicidade: 'trimestral', status: 'pendente', calendario: 1, ciclo: 0 });
    expect(daLista).not.toHaveProperty('cumprimentos');
  });

  it('ordena por próximo vencimento e reflete o cumprimento registrado (Lote 10)', async () => {
    const tarde = await nova({ prazo: '2029-12-31' });
    const cedo = await nova({ prazo: '2026-12-31' });
    let lista = (await dados()).condicionantes;
    const prazos = lista.map((c) => c.prazo);
    expect(prazos).toEqual([...prazos].sort());
    expect(lista.findIndex((c) => c.id === cedo.id)).toBeLessThan(lista.findIndex((c) => c.id === tarde.id));
    const r = await cumprimentos.POST(requisicao(`/api/condicionantes/${cedo.id}/cumprimentos`, 'POST', 'admin', { prazoReferencia: cedo.prazo }), ctx(cedo.id));
    expect(r.status).toBe(201);
    lista = (await dados()).condicionantes;
    expect(lista.find((c) => c.id === cedo.id)).toMatchObject({ prazo: '2027-01-31', ciclo: 1, status: 'pendente' });
  });

  it('inclui condicionantes de usinas inativas (a tela mostra só leitura; os alertas filtram depois)', async () => {
    const [c] = await banco.insert(schema.condicionantes).values({
      licencaId: licencaInativa, codigo: 'INAT', descricao: 'Da usina inativa', categoria: 'outro', responsavel: 'Equipe',
      periodicidade: 'anual', prazoInicial: '2027-05-01', prazo: '2027-05-01',
    }).returning();
    await banco.update(schema.usinas).set({ status: 'inativa' }).where(orm.eq(schema.usinas.id, ids.usinas[1]));
    expect((await dados()).condicionantes.some((x) => x.id === c.id)).toBe(true);
  });

  it('permissões: qualquer perfil logado lê; sem sessão, 401', async () => {
    expect((await dados('consulta')).condicionantes.length).toBeGreaterThan(0);
    expect((await dadosGET(requisicao('/api/dados', 'GET'))).status).toBe(401);
  });
});
