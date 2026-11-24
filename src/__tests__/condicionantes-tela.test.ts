import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { CondicionantesView } from '@/components/condicionantes-view';
import { HistoricoModal } from '@/components/condicionantes-modais';
import { LicencasView } from '@/components/licencas-view';
import { ToastProvider } from '@/components/toast';
import type { Condicionante, CumprimentoCondicionante, DadosOperacionais, Licenca, Papel, Usina } from '@/types/solar';
import { cumprimentoDesfazivel, filtrarCondicionantes, resumirCondicionantes } from '@/utils/condicionantes';
import { hojeISO } from '@/utils/datas';

/*
 * Lote 12: tela de condicionantes. Regras de tela (filtro, ordem, resumo, onde mostrar "Desfazer")
 * e a renderização por perfil, com os dados semeados no React Query (sem rede e sem banco).
 * As regras de negócio continuam testadas nas rotas (Lotes 9 e 10).
 */

const dia = (deslocamento: number) => {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return hojeISO(d);
};

const usinas: Usina[] = [
  { id: 'u1', nome: 'Usina Sol Nascente', localizacao: 'Petrolina, PE', capacidadeKwp: 1000, status: 'ativa' },
  { id: 'u2', nome: 'Usina Desativada', localizacao: 'Juazeiro, BA', capacidadeKwp: 500, status: 'inativa' },
];
const licencas: Licenca[] = [
  { id: 'l1', usinaId: 'u1', tipo: 'Licença de Operação', emissor: 'CPRH', numero: 'LO-100', dataValidade: '2030-01-01' },
  { id: 'l2', usinaId: 'u1', tipo: 'Licença de Instalação', emissor: 'CPRH', numero: 'LI-200', dataValidade: '2030-01-01' },
  { id: 'l3', usinaId: 'u2', tipo: 'Licença de Operação', emissor: 'INEMA', numero: 'LO-300', dataValidade: '2030-01-01' },
];
const base = { categoria: 'relatorio', responsavel: 'Equipe ambiental', calendario: 1, ciclo: 0, criadoEm: '2026-01-01T00:00:00.000Z', atualizadoEm: '2026-01-01T00:00:00.000Z' } as const;
const cond = (id: string, campos: Partial<Condicionante>): Condicionante => ({
  ...base, id, licencaId: 'l1', codigo: id.toUpperCase(), descricao: `Descrição ${id}`, periodicidade: 'mensal',
  prazoInicial: campos.prazo ?? dia(30), prazo: dia(30), status: 'pendente', ...campos,
});
const condicionantes: Condicionante[] = [
  cond('c-em-dia', { prazo: dia(40), responsavel: 'Maria Souza' }),
  cond('c-vencida', { prazo: dia(-3), categoria: 'monitoramento' }),
  cond('c-a-vencer', { prazo: dia(5), licencaId: 'l2', periodicidade: 'anual' }),
  cond('c-unica', { prazo: dia(-60), periodicidade: 'unica', status: 'cumprida', ciclo: 1, ultimoCumprimentoEm: dia(-61) }),
  cond('c-encerrada', { prazo: dia(-90), status: 'encerrada' }),
  cond('c-inativa', { prazo: dia(-1), licencaId: 'l3' }),
];
const dados: DadosOperacionais = { usinas, licencas, manutencoes: [], condicionantes };
const licencasPorId = new Map(licencas.map((l) => [l.id, l]));
const usinasPorId = new Map(usinas.map((u) => [u.id, u]));

function renderizar(elemento: ReactElement, papel: Papel, extras: [readonly unknown[], unknown][] = [], d: DadosOperacionais = dados) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(['sessao'], { email: `${papel}@example.test`, nome: `Pessoa ${papel}`, papel });
  qc.setQueryData(['dados'], d);
  for (const [chave, valor] of extras) qc.setQueryData(chave, valor);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(ToastProvider, null, elemento)));
}
const rotulos = (html: string, prefixo: string) => [...html.matchAll(new RegExp(`aria-label="${prefixo} ([^"]+)"`, 'g'))].map((m) => m[1]).sort();

describe('Regras de tela', () => {
  const filtrar = (f: Parameters<typeof filtrarCondicionantes>[1]) =>
    filtrarCondicionantes(condicionantes, f, licencasPorId, usinasPorId).map((c) => c.id);

  it('ordena pela urgência: vencidas, a vencer, em dia, cumpridas e encerradas; dentro de cada uma, pelo prazo', () => {
    expect(filtrar({})).toEqual(['c-vencida', 'c-inativa', 'c-a-vencer', 'c-em-dia', 'c-unica', 'c-encerrada']);
  });

  it('busca em código, descrição, responsável, licença e usina, sem diferenciar maiúsculas', () => {
    expect(filtrar({ busca: 'maria' })).toEqual(['c-em-dia']);
    expect(filtrar({ busca: 'li-200' })).toEqual(['c-a-vencer']);
    expect(filtrar({ busca: 'DESATIVADA' })).toEqual(['c-inativa']);
    expect(filtrar({ busca: 'descrição c-vencida' })).toEqual(['c-vencida']);
  });

  it('filtros por situação (inclusive "em acompanhamento"), usina, licença, categoria e periodicidade', () => {
    expect(filtrar({ situacao: 'vencida' })).toEqual(['c-vencida', 'c-inativa']);
    expect(filtrar({ situacao: 'acompanhadas' })).toEqual(['c-vencida', 'c-inativa', 'c-a-vencer', 'c-em-dia']);
    expect(filtrar({ situacao: 'cumprida' })).toEqual(['c-unica']);
    expect(filtrar({ usinaId: 'u2' })).toEqual(['c-inativa']);
    expect(filtrar({ licencaId: 'l2' })).toEqual(['c-a-vencer']);
    expect(filtrar({ categoria: 'monitoramento' })).toEqual(['c-vencida']);
    expect(filtrar({ periodicidade: 'anual' })).toEqual(['c-a-vencer']);
    expect(filtrar({ usinaId: 'u1', situacao: 'vencida' })).toEqual(['c-vencida']);
  });

  it('resumo para os indicadores', () => {
    expect(resumirCondicionantes(condicionantes)).toEqual({ total: 6, vencidas: 2, aVencer: 1, emDia: 1, finalizadas: 2 });
  });

  it('"Desfazer" só no cumprimento válido do período anterior, no calendário atual', () => {
    const h = (id: string, calendario: number, ciclo: number, cancelado = false) =>
      ({ id, calendario, ciclo, ...(cancelado ? { canceladoEm: '2026-11-01T00:00:00Z' } : {}) }) as CumprimentoCondicionante;
    const historico = [h('novo-cancelado', 2, 1, true), h('certo', 2, 1), h('anterior', 2, 0), h('calendario-velho', 1, 3)];
    expect(cumprimentoDesfazivel({ calendario: 2, ciclo: 2 }, historico)?.id).toBe('certo');
    expect(cumprimentoDesfazivel({ calendario: 2, ciclo: 0 }, historico)).toBeUndefined(); // recém-reiniciado
    expect(cumprimentoDesfazivel({ calendario: 3, ciclo: 1 }, historico)).toBeUndefined();
    expect(cumprimentoDesfazivel({ calendario: 2, ciclo: 2 }, [h('so-cancelado', 2, 1, true)])).toBeUndefined();
  });
});

describe('Tela /condicionantes por perfil', () => {
  it('admin: cria, registra cumprimento, edita e exclui; nada de alteração em usina inativa nem cumprir a única já cumprida', () => {
    const html = renderizar(createElement(CondicionantesView), 'admin');
    expect(html).toContain('Nova condicionante');
    expect(rotulos(html, 'Registrar cumprimento de')).toEqual(['C-A-VENCER', 'C-EM-DIA', 'C-VENCIDA']);
    expect(rotulos(html, 'Editar')).toEqual(['C-A-VENCER', 'C-EM-DIA', 'C-ENCERRADA', 'C-UNICA', 'C-VENCIDA']);
    expect(rotulos(html, 'Excluir')).toEqual(['C-A-VENCER', 'C-EM-DIA', 'C-ENCERRADA', 'C-UNICA', 'C-VENCIDA']);
    expect(rotulos(html, 'Histórico de')).toHaveLength(6); // inclusive a da usina inativa
  });

  it('gestor: mesmas ações do admin', () => {
    const html = renderizar(createElement(CondicionantesView), 'gestor');
    expect(html).toContain('Nova condicionante');
    expect(rotulos(html, 'Excluir')).toHaveLength(5);
  });

  it('consulta: só lê e vê o histórico, sem nenhum botão de alteração', () => {
    const html = renderizar(createElement(CondicionantesView), 'consulta');
    expect(html).not.toContain('Nova condicionante');
    expect(rotulos(html, 'Registrar cumprimento de')).toEqual([]);
    expect(rotulos(html, 'Editar')).toEqual([]);
    expect(rotulos(html, 'Excluir')).toEqual([]);
    expect(rotulos(html, 'Histórico de')).toHaveLength(6);
  });

  it('mostra situação, responsável, licença, usina, periodicidade e próximo vencimento', () => {
    const html = renderizar(createElement(CondicionantesView), 'consulta');
    for (const texto of ['Vencida', 'Vence em breve', 'Em dia', 'Cumprida', 'Encerrada', 'Maria Souza',
      'Licença de Operação · LO-100', 'Usina Sol Nascente', 'Mensal', 'Anual', 'Única', 'Próximo vencimento', 'Cumprida em']) {
      expect(html, texto).toContain(texto);
    }
    expect(html).toContain('href="/usinas/u1?aba=condicionantes"');
    expect(html).toContain('Indicadores de condicionantes');
  });

  it('aba da usina: só as condicionantes dela, sem indicadores; usina inativa fica só leitura', () => {
    const daAtiva = renderizar(createElement(CondicionantesView, { usinaId: 'u1' }), 'admin');
    expect(rotulos(daAtiva, 'Histórico de')).toEqual(['C-A-VENCER', 'C-EM-DIA', 'C-ENCERRADA', 'C-UNICA', 'C-VENCIDA']);
    expect(daAtiva).not.toContain('Indicadores de condicionantes');
    const daInativa = renderizar(createElement(CondicionantesView, { usinaId: 'u2' }), 'admin');
    expect(rotulos(daInativa, 'Histórico de')).toEqual(['C-INATIVA']);
    expect(rotulos(daInativa, 'Editar')).toEqual([]);
    expect(daInativa).not.toContain('Nova condicionante'); // a usina não tem licença ativa para receber
  });

  it('atalho da licença (?licenca=): filtra e mostra o filtro ativo', () => {
    const html = renderizar(createElement(CondicionantesView, { licencaInicial: 'l2' }), 'admin');
    expect(rotulos(html, 'Histórico de')).toEqual(['C-A-VENCER']);
    expect(html).toContain('Licença: Licença de Instalação · LI-200');
  });

  it('banco sem condicionantes (ex.: migração 0002 pendente): mensagem de lista vazia, sem erro', () => {
    const vazio = { ...dados, condicionantes: [] };
    expect(renderizar(createElement(CondicionantesView), 'admin', [], vazio)).toContain('Nenhuma condicionante cadastrada');
    expect(renderizar(createElement(CondicionantesView), 'consulta', [], vazio)).toContain('Ainda não há condicionantes para acompanhar.');
  });
});

describe('Histórico e atalho nas licenças', () => {
  const periodica = cond('c-hist', { calendario: 1, ciclo: 2, prazo: dia(20) });
  const historico: CumprimentoCondicionante[] = [
    { id: 'h3', condicionanteId: 'c-hist', calendario: 1, ciclo: 1, prazoReferencia: '2026-10-31', cumpridaEm: '2026-10-30', registradoPor: 'p', registradoPorNome: 'Ana Gestora', registradoEm: '2026-10-30T12:00:00Z' },
    { id: 'h2', condicionanteId: 'c-hist', calendario: 1, ciclo: 1, prazoReferencia: '2026-10-31', cumpridaEm: '2026-10-29', registradoPor: 'p', registradoPorNome: 'Ana Gestora', registradoEm: '2026-10-29T12:00:00Z', canceladoEm: '2026-10-30T11:00:00Z', canceladoPor: 'q', canceladoPorNome: 'Bruno Admin', motivoCancelamento: 'Data errada no registro' },
    { id: 'h1', condicionanteId: 'c-hist', calendario: 1, ciclo: 0, prazoReferencia: '2026-09-30', cumpridaEm: '2026-09-28', observacao: 'Protocolo 77/2026', registradoPor: 'p', registradoPorNome: 'Ana Gestora', registradoEm: '2026-09-28T12:00:00Z' },
  ];
  const comHistorico: [readonly unknown[], unknown][] = [[['cumprimentos', 'c-hist'], historico]];

  it('mostra todos, inclusive o cancelado com autor e motivo; "Desfazer" só no último válido', () => {
    const html = renderizar(createElement(HistoricoModal, { item: periodica, podeDesfazer: true, onFechar: () => {} }), 'admin', comHistorico);
    expect(html.match(/Vencimento /g)).toHaveLength(3);
    expect(html).toContain('Protocolo 77/2026');
    expect(html).toContain('Bruno Admin');
    expect(html).toContain('Motivo: Data errada no registro');
    expect(html.match(/Desfazer este cumprimento/g)).toHaveLength(1);
    expect(html.indexOf('Desfazer este cumprimento')).toBeGreaterThan(html.indexOf('Cumprido em 30/10/2026'));
    expect(html.indexOf('Desfazer este cumprimento')).toBeLessThan(html.indexOf('Data errada no registro'));
  });

  it('sem permissão (consulta, ou usina inativa), o histórico aparece mas sem "Desfazer"', () => {
    const html = renderizar(createElement(HistoricoModal, { item: periodica, podeDesfazer: false, onFechar: () => {} }), 'consulta', comHistorico);
    expect(html.match(/Vencimento /g)).toHaveLength(3);
    expect(html).not.toContain('Desfazer este cumprimento');
  });

  it('lista de licenças: atalho para as condicionantes de cada licença, com as vencidas destacadas', () => {
    const html = renderizar(createElement(LicencasView), 'consulta');
    expect(html).toContain('href="/condicionantes?licenca=l1"');
    expect(html).toContain('aria-label="Condicionantes de LO-100"');
    expect(html).toMatch(/LO-100[\s\S]*2 em acompanhamento[\s\S]*1 vencida/); // em dia + vencida; única e encerrada não contam
    expect(html).toMatch(/LO-300[\s\S]*1 em acompanhamento[\s\S]*1 vencida/);
  });
});
