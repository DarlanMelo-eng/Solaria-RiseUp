'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, BadgePrioridade, Button, Card, Confirmar, ErroCarga, IconButton, inputCls, filtroCls, ROTULO_STATUS_MANUTENCAO, Skeleton } from './ui';
import { ManutencaoModal } from './formularios';
import { Paginacao } from './paginacao';
import { ordenarPorChave } from '@/utils/ordenacao';
import { ResumoIndicador } from './resumo-indicador';
import { AlertTriangle, CalendarCheck, ClipboardList, Clock3 } from 'lucide-react';
import { useDados, useEditarManutencao, useExcluirManutencao, useSessao } from '@/hooks/useApi';
import { pode } from '@/lib/permissoes';
import { baixarCsv } from '@/utils/csv';
import { descreverPrazo, diasAte, formatarData, manutencaoAtrasada } from '@/utils/datas';
import type { Manutencao, StatusManutencao } from '@/types/solar';
import { contar } from '@/utils/texto';

export type Situacao = 'todas' | 'abertas' | 'atrasadas' | 'concluidas';
const COLUNAS: StatusManutencao[] = ['pendente', 'em_andamento', 'concluida'];
const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };

/** Quadro de manutenções em colunas. Com `usinaId`, mostra só aquela usina (aba da usina). */
export function ManutencoesView({ usinaId, situacaoInicial = 'todas' }: { usinaId?: string; situacaoInicial?: Situacao }) {
  const { data: sessao } = useSessao();
  const { usinas, manutencoes, carregando, erro, recarregar } = useDados();
  const editar = useEditarManutencao();
  const excluir = useExcluirManutencao();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const porPagina = 24;
  const [situacao, setSituacao] = useState<Situacao>(situacaoInicial);
  const [prioridade, setPrioridade] = useState('');
  const [filtroUsina, setFiltroUsina] = useState('');
  const [modal, setModal] = useState<{ item?: Manutencao } | null>(null);
  const [apagar, setApagar] = useState<Manutencao | null>(null);
  const [concluir, setConcluir] = useState<Manutencao | null>(null);

  const usinasPorId = useMemo(() => new Map(usinas.map((u) => [u.id, u])), [usinas]);
  const ativas = useMemo(() => usinas.filter((u) => u.status === 'ativa'), [usinas]);
  const usinaAtual = usinaId ? usinasPorId.get(usinaId) : undefined;
  const podeCriar = pode(sessao?.papel, 'escrever') && (usinaId ? usinaAtual?.status === 'ativa' : ativas.length > 0);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtradas = manutencoes
      .filter((m) => (usinaId ?? (filtroUsina || m.usinaId)) === m.usinaId)
      .filter((m) => !prioridade || m.prioridade === prioridade)
      .filter((m) => situacao === 'todas' || (situacao === 'abertas' ? m.status !== 'concluida' : situacao === 'concluidas' ? m.status === 'concluida' : manutencaoAtrasada(m)))
      .filter((m) => !q || [m.titulo, m.responsavel, usinasPorId.get(m.usinaId)?.nome ?? ''].some((c) => c.toLowerCase().includes(q)));
    // Prioridade e depois prazo. Os dias são calculados uma vez por item (ver ordenarPorChave):
    // dentro da comparação, 30 000 manutenções travavam a tela por cerca de 0,5 s a cada tecla.
    const agora = new Date();
    return ordenarPorChave(filtradas, (m) => [ORDEM_PRIORIDADE[m.prioridade], diasAte(m.prazo, agora) ?? -9999]);
  }, [manutencoes, busca, situacao, prioridade, filtroUsina, usinaId, usinasPorId]);
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(lista.length / porPagina)));
  const visiveis = lista.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);
  const resumo = useMemo(() => {
    const base = usinaId ? manutencoes.filter((m) => m.usinaId === usinaId) : manutencoes;
    return {
      total: base.length,
      abertas: base.filter((m) => m.status !== 'concluida').length,
      atrasadas: base.filter((m) => manutencaoAtrasada(m)).length,
      concluidas: base.filter((m) => m.status === 'concluida').length,
    };
  }, [manutencoes, usinaId]);

  if (erro) return <ErroCarga onTentar={recarregar} />;

  const mover = (m: Manutencao, status: StatusManutencao) => {
    if (status === m.status) return;
    if (status === 'concluida') setConcluir(m);
    else editar.mutate({ id: m.id, dados: { status } });
  };

  const exportar = () =>
    baixarCsv('manutencoes.csv', ['Usina', 'Título', 'Responsável', 'Prazo', 'Prioridade', 'Status'],
      lista.map((m) => [usinasPorId.get(m.usinaId)?.nome ?? '', m.titulo, m.responsavel, formatarData(m.prazo), m.prioridade, ROTULO_STATUS_MANUTENCAO[m.status]]));

  return (
    <>
      {!usinaId && (
        <>
          <section aria-label="Indicadores de manutenção" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <ResumoIndicador titulo="Todas as manutenções" valor={carregando ? '—' : resumo.total} detalhe="Agendadas e concluídas" icone={<ClipboardList className="size-5" />} />
            <ResumoIndicador titulo="Em aberto" valor={carregando ? '—' : resumo.abertas} detalhe="Pendentes ou em andamento" icone={<Clock3 className="size-5" />} />
            <ResumoIndicador titulo="Atrasadas" valor={carregando ? '—' : resumo.atrasadas} detalhe="Precisam de atenção" icone={<AlertTriangle className="size-5" />} />
            <ResumoIndicador titulo="Concluídas" valor={carregando ? '—' : resumo.concluidas} detalhe="Serviços finalizados" icone={<CalendarCheck className="size-5" />} />
          </section>
          <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <strong>Como acompanhar:</strong> priorize os serviços atrasados, filtre por responsável ou usina e altere o status no próprio cartão.
          </p>
        </>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <input aria-label="Buscar manutenções" placeholder="Buscar por título ou responsável…" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${inputCls} pl-9`} />
        </div>
        <select aria-label="Filtrar por situação" value={situacao} onChange={(e) => { setSituacao(e.target.value as Situacao); setPagina(1); }} className={`${filtroCls}`}>
          <option value="todas">Todas</option><option value="abertas">Em aberto</option><option value="atrasadas">Atrasadas</option><option value="concluidas">Concluídas</option>
        </select>
        <select aria-label="Filtrar por prioridade" value={prioridade} onChange={(e) => { setPrioridade(e.target.value); setPagina(1); }} className={`${filtroCls}`}>
          <option value="">Qualquer prioridade</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
        </select>
        {!usinaId && (
          <select aria-label="Filtrar por usina" value={filtroUsina} onChange={(e) => { setFiltroUsina(e.target.value); setPagina(1); }} className={`${filtroCls}`}>
            <option value="">Todas as usinas</option>
            {usinas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <Button onClick={exportar} disabled={!lista.length}><Download className="size-4" aria-hidden />CSV</Button>
        {podeCriar && <Button variante="primario" onClick={() => setModal({})}><Plus className="size-4" aria-hidden />Nova manutenção</Button>}
      </div>

      <p className="mb-3 text-xs text-slate-500" aria-live="polite">{carregando ? 'Carregando manutenções…' : contar(lista.length, 'manutenção encontrada', 'manutenções encontradas')}</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUNAS.map((col) => {
          const itens = visiveis.filter((m) => m.status === col);
          return (
            <section key={col} aria-label={ROTULO_STATUS_MANUTENCAO[col]} className="rounded-2xl bg-slate-100/70 p-3">
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
                {ROTULO_STATUS_MANUTENCAO[col]}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{itens.length}</span>
              </h2>
              <div className="space-y-3">
                {carregando && <Skeleton className="h-28" />}
                {!carregando && itens.length === 0 && <p className="px-1 py-6 text-center text-sm text-slate-400">Nada por aqui</p>}
                {itens.map((m) => {
                  const usina = usinasPorId.get(m.usinaId);
                  const editavel = usina?.status === 'ativa';
                  const atrasada = manutencaoAtrasada(m);
                  return (
                    <Card key={m.id} className={atrasada ? 'border-red-300 p-4' : 'p-4'}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-slate-900">{m.titulo}</p>
                        <BadgePrioridade p={m.prioridade} />
                      </div>
                      {!usinaId && (
                        <Link href={`/usinas/${m.usinaId}?aba=manutencoes`} className="mt-1 block text-xs font-medium text-amber-700 hover:underline">{usina?.nome}</Link>
                      )}
                      <p className="mt-1 text-xs text-slate-500">{m.responsavel}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-slate-600">{formatarData(m.prazo)}</span>
                        {m.status === 'concluida'
                          ? m.concluidaEm && <Badge cor="verde">Concluída em {formatarData(m.concluidaEm)}</Badge>
                          : <Badge cor={atrasada ? 'vermelho' : (diasAte(m.prazo) ?? 99) <= 7 ? 'amarelo' : 'cinza'}>{atrasada ? 'Atrasada · ' : ''}{descreverPrazo(m.prazo)}</Badge>}
                      </div>
                      {editavel && pode(sessao?.papel, 'escrever') && (
                        <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3">
                          <select aria-label={`Mover "${m.titulo}"`} value={m.status} onChange={(e) => mover(m, e.target.value as StatusManutencao)} className={`${inputCls} flex-1 py-1.5`}>
                            {COLUNAS.map((c) => <option key={c} value={c}>{ROTULO_STATUS_MANUTENCAO[c]}</option>)}
                          </select>
                          <IconButton rotulo={`Editar ${m.titulo}`} onClick={() => setModal({ item: m })}><Pencil className="size-4" /></IconButton>
                          {pode(sessao?.papel, 'excluir') && <IconButton rotulo={`Excluir ${m.titulo}`} onClick={() => setApagar(m)}><Trash2 className="size-4" /></IconButton>}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Paginacao pagina={paginaAtual} total={lista.length} porPagina={porPagina} aoMudar={setPagina} />
      {modal && <ManutencaoModal item={modal.item} usinas={usinaId ? usinas : ativas} usinaId={usinaId} onFechar={() => setModal(null)} />}
      {apagar && (
        <Confirmar perigo titulo="Excluir manutenção" rotulo="Excluir" carregando={excluir.isPending}
          mensagem={`Excluir "${apagar.titulo}"? Essa ação não pode ser desfeita.`}
          onFechar={() => setApagar(null)}
          onConfirmar={() => excluir.mutate(apagar.id, { onSuccess: () => setApagar(null) })} />
      )}
      {concluir && (
        <Confirmar titulo="Concluir manutenção" rotulo="Marcar como concluída" carregando={editar.isPending}
          mensagem={`Confirmar a conclusão de "${concluir.titulo}"? A data de hoje será registrada.`}
          onFechar={() => setConcluir(null)}
          onConfirmar={() => editar.mutate({ id: concluir.id, dados: { status: 'concluida' } }, { onSuccess: () => setConcluir(null) })} />
      )}
    </>
  );
}
