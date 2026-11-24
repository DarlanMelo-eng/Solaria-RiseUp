'use client';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, CircleCheck, ClipboardCheck, History, ListChecks, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, Confirmar, ErroCarga, filtroCls, IconButton, inputCls, Skeleton, Vazio } from './ui';
import { ResumoIndicador } from './resumo-indicador';
import { Tabela, type ColumnDef } from './tabela';
import { CumprimentoModal, EditarCondicionanteModal, HistoricoModal, NovaCondicionanteModal } from './condicionantes-modais';
import { useDados, useExcluirCondicionante, useSessao } from '@/hooks/useApi';
import { pode } from '@/lib/permissoes';
import type { Condicionante } from '@/types/solar';
import { filtrarCondicionantes, ORDEM_SITUACAO, resumirCondicionantes, type FiltrosCondicionante } from '@/utils/condicionantes';
import { descreverPrazo, formatarData } from '@/utils/datas';
import {
  ROTULO_CATEGORIA, ROTULO_PERIODICIDADE, ROTULO_SITUACAO, situacaoCondicionante, type SituacaoCondicionante,
} from '@/utils/periodicidade';
import { contar } from '@/utils/texto';

const COR_SITUACAO = { vencida: 'vermelho', a_vencer: 'amarelo', em_dia: 'verde', cumprida: 'azul', encerrada: 'cinza' } as const;
export const SITUACOES_FILTRO = ['acompanhadas', 'vencida', 'a_vencer', 'em_dia', 'cumprida', 'encerrada'] as const;
export type FiltroSituacao = (typeof SITUACOES_FILTRO)[number] | '';

type Dialogo =
  | { tipo: 'nova' }
  | { tipo: 'editar' | 'cumprir' | 'historico' | 'excluir'; item: Condicionante };

/**
 * Lista de condicionantes. Sem `usinaId`: todas (/condicionantes). Com `usinaId`: só as da usina (aba).
 * `licencaInicial` e `situacaoInicial` vêm da URL (atalhos da lista de licenças e dos indicadores).
 * O que cada perfil pode fazer só decide quais botões aparecem; quem autoriza é a API.
 */
export function CondicionantesView({ usinaId, licencaInicial = '', situacaoInicial = '' }: {
  usinaId?: string; licencaInicial?: string; situacaoInicial?: FiltroSituacao;
}) {
  const { data: sessao } = useSessao();
  const { usinas, licencas, condicionantes, carregando, erro, recarregar } = useDados();
  const excluir = useExcluirCondicionante();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<FiltroSituacao>(situacaoInicial);
  const [categoria, setCategoria] = useState('');
  const [periodicidade, setPeriodicidade] = useState('');
  const [filtroUsina, setFiltroUsina] = useState('');
  const [filtroLicenca, setFiltroLicenca] = useState(licencaInicial);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);

  const usinasPorId = useMemo(() => new Map(usinas.map((u) => [u.id, u])), [usinas]);
  const licencasPorId = useMemo(() => new Map(licencas.map((l) => [l.id, l])), [licencas]);
  const usinaDoFiltro = usinaId ?? filtroUsina;
  const daUsina = useMemo(
    () => (usinaId ? condicionantes.filter((c) => licencasPorId.get(c.licencaId)?.usinaId === usinaId) : condicionantes),
    [condicionantes, licencasPorId, usinaId],
  );
  const lista = useMemo(() => {
    const filtros: FiltrosCondicionante = { busca, situacao, usinaId: usinaDoFiltro, licencaId: filtroLicenca, categoria, periodicidade };
    return filtrarCondicionantes(daUsina, filtros, licencasPorId, usinasPorId);
  }, [daUsina, busca, situacao, usinaDoFiltro, filtroLicenca, categoria, periodicidade, licencasPorId, usinasPorId]);
  const resumo = useMemo(() => resumirCondicionantes(daUsina), [daUsina]);

  const escreve = pode(sessao?.papel, 'escrever');
  const apaga = pode(sessao?.papel, 'excluir');
  const editavel = useCallback(
    (c: Condicionante) => usinasPorId.get(licencasPorId.get(c.licencaId)?.usinaId ?? '')?.status === 'ativa',
    [licencasPorId, usinasPorId],
  );
  // Licenças que podem receber uma condicionante nova: de usinas ativas (e da usina/licença filtrada).
  const licencasParaNova = licencas.filter((l) => usinasPorId.get(l.usinaId)?.status === 'ativa'
    && (!usinaDoFiltro || l.usinaId === usinaDoFiltro) && (!filtroLicenca || l.id === filtroLicenca));
  const licencaDoFiltro = filtroLicenca ? licencasPorId.get(filtroLicenca) : undefined;
  const opcoesLicenca = licencas.filter((l) => !usinaDoFiltro || l.usinaId === usinaDoFiltro);

  const colunas = useMemo<ColumnDef<Condicionante>[]>(() => {
    const cols: ColumnDef<Condicionante>[] = [
      {
        id: 'codigo', header: 'Condicionante', accessorFn: (c) => c.codigo, meta: { className: 'min-w-52' },
        cell: ({ row: { original: c } }) => (
          <>
            <p className="font-medium text-slate-900">{c.codigo}</p>
            <p className="line-clamp-2 max-w-md text-xs text-slate-500" title={c.descricao}>{c.descricao}</p>
            <p className="mt-1 text-xs text-slate-600">Responsável: {c.responsavel}</p>
          </>
        ),
      },
      {
        id: 'licenca', header: usinaId ? 'Licença' : 'Licença e usina', accessorFn: (c) => licencasPorId.get(c.licencaId)?.numero ?? '',
        meta: { className: 'min-w-56' },
        cell: ({ row: { original: c } }) => {
          const l = licencasPorId.get(c.licencaId);
          const u = l ? usinasPorId.get(l.usinaId) : undefined;
          return (
            <>
              <p className="text-slate-700">{l ? `${l.tipo} · ${l.numero}` : '—'}</p>
              {!usinaId && u && (
                <Link href={`/usinas/${u.id}?aba=condicionantes`} className="text-xs font-medium text-amber-700 hover:underline">{u.nome}</Link>
              )}
              {u?.status === 'inativa' && <span className="ml-1"><Badge cor="cinza">Inativa</Badge></span>}
            </>
          );
        },
      },
      {
        id: 'periodicidade', header: 'Periodicidade', accessorFn: (c) => ROTULO_PERIODICIDADE[c.periodicidade],
        cell: ({ row: { original: c } }) => (
          <><p>{ROTULO_PERIODICIDADE[c.periodicidade]}</p><p className="text-xs text-slate-500">{ROTULO_CATEGORIA[c.categoria]}</p></>
        ),
      },
      {
        id: 'prazo', header: 'Próximo vencimento', accessorFn: (c) => c.prazo,
        cell: ({ row: { original: c } }) => c.status === 'cumprida' ? (
          <p className="text-slate-600">Cumprida em {c.ultimoCumprimentoEm ? formatarData(c.ultimoCumprimentoEm) : '—'}</p>
        ) : (
          <>
            <p>{formatarData(c.prazo)}</p>
            {c.status !== 'encerrada' && <p className="text-xs text-slate-500">{descreverPrazo(c.prazo)}</p>}
          </>
        ),
      },
      {
        id: 'situacao', header: 'Situação', accessorFn: (c) => ORDEM_SITUACAO[situacaoCondicionante(c)],
        cell: ({ row: { original: c } }) => {
          const s: SituacaoCondicionante = situacaoCondicionante(c);
          return (
            <>
              <Badge cor={COR_SITUACAO[s]}>{ROTULO_SITUACAO[s]}</Badge>
              {c.status === 'em_andamento' && <p className="mt-1 text-xs text-slate-500">Em andamento</p>}
            </>
          );
        },
      },
      {
        id: 'acoes', header: () => <span className="sr-only">Ações</span>, meta: { className: 'w-40 text-right' },
        cell: ({ row: { original: c } }) => {
          const altera = editavel(c);
          const aberta = c.status === 'pendente' || c.status === 'em_andamento';
          return (
            <div className="flex justify-end">
              {altera && escreve && aberta && (
                <IconButton rotulo={`Registrar cumprimento de ${c.codigo}`} onClick={() => setDialogo({ tipo: 'cumprir', item: c })}><CircleCheck className="size-4" /></IconButton>
              )}
              <IconButton rotulo={`Histórico de ${c.codigo}`} onClick={() => setDialogo({ tipo: 'historico', item: c })}><History className="size-4" /></IconButton>
              {altera && escreve && <IconButton rotulo={`Editar ${c.codigo}`} onClick={() => setDialogo({ tipo: 'editar', item: c })}><Pencil className="size-4" /></IconButton>}
              {altera && apaga && <IconButton rotulo={`Excluir ${c.codigo}`} onClick={() => setDialogo({ tipo: 'excluir', item: c })}><Trash2 className="size-4" /></IconButton>}
            </div>
          );
        },
      },
    ];
    return cols;
  }, [licencasPorId, usinasPorId, usinaId, escreve, apaga, editavel]);

  if (erro) return <ErroCarga onTentar={recarregar} />;

  const limparLicenca = () => setFiltroLicenca('');
  const vazio = daUsina.length === 0
    ? <Vazio titulo="Nenhuma condicionante cadastrada" texto={escreve ? 'Cadastre as condicionantes das licenças para acompanhar os prazos.' : 'Ainda não há condicionantes para acompanhar.'} />
    : <Vazio titulo="Nenhuma condicionante encontrada" texto="Ajuste a busca ou os filtros." />;

  return (
    <>
      {!usinaId && (
        <section aria-label="Indicadores de condicionantes" className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ResumoIndicador titulo="Condicionantes" valor={carregando ? '—' : resumo.total} detalhe={carregando ? 'Carregando' : contar(resumo.emDia, 'em dia', 'em dia')} icone={<ListChecks className="size-5" />} />
          <ResumoIndicador titulo="Vencidas" valor={carregando ? '—' : resumo.vencidas} detalhe="Prazo passado sem cumprimento" icone={<AlertCircle className="size-5" />} />
          <ResumoIndicador titulo="Vencem em breve" valor={carregando ? '—' : resumo.aVencer} detalhe="Até 15 dias" icone={<CalendarClock className="size-5" />} />
          <ResumoIndicador titulo="Cumpridas ou encerradas" valor={carregando ? '—' : resumo.finalizadas} detalhe="Fora do acompanhamento" icone={<ClipboardCheck className="size-5" />} />
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <input aria-label="Buscar condicionantes" placeholder="Buscar por código, descrição, responsável, licença…" value={busca} onChange={(e) => setBusca(e.target.value)} className={`${inputCls} pl-9`} />
        </div>
        <select aria-label="Filtrar por situação" value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSituacao)} className={`${filtroCls} max-w-full`}>
          <option value="">Todas as situações</option>
          <option value="acompanhadas">Em acompanhamento</option>
          {(['vencida', 'a_vencer', 'em_dia', 'cumprida', 'encerrada'] as const).map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
        </select>
        <select aria-label="Filtrar por categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${filtroCls} max-w-full`}>
          <option value="">Todas as categorias</option>
          {Object.entries(ROTULO_CATEGORIA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
        <select aria-label="Filtrar por periodicidade" value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)} className={`${filtroCls} max-w-full`}>
          <option value="">Qualquer periodicidade</option>
          {Object.entries(ROTULO_PERIODICIDADE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
        {!usinaId && (
          <select aria-label="Filtrar por usina" value={filtroUsina} onChange={(e) => { setFiltroUsina(e.target.value); setFiltroLicenca(''); }} className={`${filtroCls} max-w-full`}>
            <option value="">Todas as usinas</option>
            {usinas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <select aria-label="Filtrar por licença" value={filtroLicenca} onChange={(e) => setFiltroLicenca(e.target.value)} className={`${filtroCls} max-w-full`}>
          <option value="">Todas as licenças</option>
          {opcoesLicenca.map((l) => <option key={l.id} value={l.id}>{l.tipo} · {l.numero}</option>)}
        </select>
        {escreve && licencasParaNova.length > 0 && (
          <Button variante="primario" onClick={() => setDialogo({ tipo: 'nova' })}><Plus className="size-4" aria-hidden />Nova condicionante</Button>
        )}
      </div>

      {licencaDoFiltro && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
          Licença: {licencaDoFiltro.tipo} · {licencaDoFiltro.numero}
          <button type="button" onClick={limparLicenca} aria-label="Mostrar todas as licenças" className="rounded-full p-0.5 hover:bg-amber-100"><X className="size-3" aria-hidden /></button>
        </p>
      )}
      <p className="mb-3 text-xs text-slate-500" aria-live="polite">{carregando ? 'Carregando condicionantes…' : contar(lista.length, 'condicionante exibida', 'condicionantes exibidas')}</p>
      <Card className="relative">
        {carregando ? (
          <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <Tabela dados={lista} colunas={colunas} rotulo="Condicionantes ambientais" idDaLinha={(c) => c.id} porPagina={15}
            larguraMinima="min-w-[900px]" vazio={vazio} />
        )}
      </Card>

      {dialogo?.tipo === 'nova' && (
        <NovaCondicionanteModal licencas={licencasParaNova} usinasPorId={usinasPorId} licencaId={filtroLicenca || undefined} onFechar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'editar' && <EditarCondicionanteModal item={dialogo.item} onFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'cumprir' && <CumprimentoModal item={dialogo.item} onFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'historico' && (
        <HistoricoModal item={condicionantes.find((c) => c.id === dialogo.item.id) ?? dialogo.item}
          podeDesfazer={apaga && editavel(dialogo.item)} onFechar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'excluir' && (
        <Confirmar perigo titulo="Excluir condicionante" rotulo="Excluir" carregando={excluir.isPending}
          mensagem={`Excluir "${dialogo.item.codigo}"? Só é possível sem cumprimentos registrados; com histórico, encerre-a pela edição.`}
          onFechar={() => setDialogo(null)}
          onConfirmar={() => excluir.mutate(dialogo.item.id, { onSuccess: () => setDialogo(null) })} />
      )}
    </>
  );
}
