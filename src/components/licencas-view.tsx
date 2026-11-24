'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, ClipboardCheck, Download, FileCheck2, Files, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ErroCarga, Badge, BadgeLicenca, Button, Card, Confirmar, IconButton, inputCls, filtroCls, Skeleton, Vazio } from './ui';
import { LicencaModal } from './formularios';
import { ResumoIndicador } from './resumo-indicador';
import { Paginacao } from './paginacao';
import { useDados, useExcluirLicenca, useSessao } from '@/hooks/useApi';
import { pode } from '@/lib/permissoes';
import { baixarCsv } from '@/utils/csv';
import { calcularStatusLicenca, descreverPrazo, diasAte, formatarData } from '@/utils/datas';
import type { Licenca, StatusLicenca } from '@/types/solar';
import { situacaoCondicionante } from '@/utils/periodicidade';
import { contar } from '@/utils/texto';

type Filtro = StatusLicenca | 'todas';

/** Lista de licenças. Com `usinaId`, mostra só aquela usina (aba da usina); sem, mostra todas (/licencas). */
export function LicencasView({ usinaId, statusInicial = 'todas' }: { usinaId?: string; statusInicial?: Filtro }) {
  const { data: sessao } = useSessao();
  const { usinas, licencas, condicionantes, carregando, erro, recarregar } = useDados();
  const excluir = useExcluirLicenca();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const porPagina = 15;
  const [status, setStatus] = useState<Filtro>(statusInicial);
  const [filtroUsina, setFiltroUsina] = useState('');
  const [modal, setModal] = useState<{ item?: Licenca } | null>(null);
  const [apagar, setApagar] = useState<Licenca | null>(null);

  const usinasPorId = useMemo(() => new Map(usinas.map((u) => [u.id, u])), [usinas]);
  const ativas = useMemo(() => usinas.filter((u) => u.status === 'ativa'), [usinas]);
  const usinaAtual = usinaId ? usinasPorId.get(usinaId) : undefined;
  // Atalho para as condicionantes de cada licença: quantas estão em acompanhamento e quantas vencidas.
  const condicionantesPorLicenca = useMemo(() => {
    const mapa = new Map<string, { abertas: number; vencidas: number }>();
    const agora = new Date();
    for (const c of condicionantes) {
      const s = situacaoCondicionante(c, agora);
      if (s === 'cumprida' || s === 'encerrada') continue;
      const atual = mapa.get(c.licencaId) ?? { abertas: 0, vencidas: 0 };
      atual.abertas++;
      if (s === 'vencida') atual.vencidas++;
      mapa.set(c.licencaId, atual);
    }
    return mapa;
  }, [condicionantes]);
  const podeCriar = pode(sessao?.papel, 'escrever') && (usinaId ? usinaAtual?.status === 'ativa' : ativas.length > 0);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return licencas
      .filter((l) => (usinaId ?? (filtroUsina || l.usinaId)) === l.usinaId)
      .filter((l) => status === 'todas' || calcularStatusLicenca(l.dataValidade) === status)
      .filter((l) => !q || [l.tipo, l.numero, l.emissor, usinasPorId.get(l.usinaId)?.nome ?? ''].some((c) => c.toLowerCase().includes(q)))
      .sort((a, b) => (diasAte(a.dataValidade) ?? -9999) - (diasAte(b.dataValidade) ?? -9999));
  }, [licencas, busca, status, filtroUsina, usinaId, usinasPorId]);
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(linhas.length / porPagina)));
  const visiveis = linhas.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  if (erro) return <ErroCarga onTentar={recarregar} />;

  const totalExpiradas = licencas.filter((l) => calcularStatusLicenca(l.dataValidade) === 'expirada').length;
  const totalProximas = licencas.filter((l) => calcularStatusLicenca(l.dataValidade) === 'proximo_vencimento').length;
  const totalValidas = licencas.filter((l) => calcularStatusLicenca(l.dataValidade) === 'valida').length;

  const exportar = () =>
    baixarCsv('licencas.csv', ['Usina', 'Tipo', 'Emissor', 'Número', 'Validade', 'Situação'],
      linhas.map((l) => [usinasPorId.get(l.usinaId)?.nome ?? '', l.tipo, l.emissor, l.numero, formatarData(l.dataValidade), calcularStatusLicenca(l.dataValidade)]));

  return (
    <>
      {!usinaId && <>
        <section aria-label="Indicadores de licenças" className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ResumoIndicador titulo="Licenças" valor={carregando ? '—' : licencas.length} detalhe="Total acompanhado" icone={<Files className="size-5" />} />
          <ResumoIndicador titulo="Válidas" valor={carregando ? '—' : totalValidas} detalhe="Prazo regular" icone={<FileCheck2 className="size-5" />} />
          <ResumoIndicador titulo="Vencem em breve" valor={carregando ? '—' : totalProximas} detalhe="Até 15 dias para vencer" icone={<CalendarClock className="size-5" />} />
          <ResumoIndicador titulo="Expiradas" valor={carregando ? '—' : totalExpiradas} detalhe="Requerem atenção" icone={<AlertCircle className="size-5" />} />
        </section>
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <strong>Como acompanhar:</strong> a lista começa pelas licenças mais urgentes. Use o filtro de situação para localizar vencidas ou próximas do vencimento; exporte o resultado em CSV.
        </div>
      </>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <input aria-label="Buscar licenças" placeholder="Buscar por tipo, número, emissor…" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${inputCls} pl-9`} />
        </div>
        <select aria-label="Filtrar por situação" value={status} onChange={(e) => { setStatus(e.target.value as Filtro); setPagina(1); }} className={`${filtroCls}`}>
          <option value="todas">Todas as situações</option>
          <option value="expirada">Expiradas</option>
          <option value="proximo_vencimento">Vencem em breve</option>
          <option value="valida">Válidas</option>
        </select>
        {!usinaId && (
          <select aria-label="Filtrar por usina" value={filtroUsina} onChange={(e) => { setFiltroUsina(e.target.value); setPagina(1); }} className={`${filtroCls}`}>
            <option value="">Todas as usinas</option>
            {usinas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <Button onClick={exportar} disabled={!linhas.length}><Download className="size-4" aria-hidden />CSV</Button>
        {podeCriar && <Button variante="primario" onClick={() => setModal({})}><Plus className="size-4" aria-hidden />Nova licença</Button>}
      </div>

      <p className="mb-3 text-xs text-slate-500" aria-live="polite">{carregando ? 'Carregando licenças…' : `${contar(linhas.length, 'licença exibida', 'licenças exibidas')}`}</p>
      <Card className="relative overflow-x-auto">
        {carregando ? (
          <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : linhas.length === 0 ? (
          <Vazio titulo="Nenhuma licença encontrada" texto={licencas.length ? 'Ajuste a busca ou os filtros.' : 'Cadastre a primeira licença para acompanhar os vencimentos.'} />
        ) : (
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Licença</th>
                {!usinaId && <th className="px-4 py-3">Usina</th>}
                <th className="px-4 py-3">Emissor</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Condicionantes</th>
                <th className="w-24 px-4 py-3"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiveis.map((l) => {
                const usina = usinasPorId.get(l.usinaId);
                const editavel = usina?.status === 'ativa';
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{l.tipo}</p>
                      <p className="text-xs text-slate-500">{l.numero}{l.observacao && ` · ${l.observacao}`}</p>
                    </td>
                    {!usinaId && (
                      <td className="px-4 py-3">
                        <Link href={`/usinas/${l.usinaId}?aba=licencas`} className="font-medium text-amber-700 hover:underline">{usina?.nome}</Link>
                        {!editavel && <Badge cor="cinza">Inativa</Badge>}
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-600">{l.emissor}</td>
                    <td className="px-4 py-3">
                      <p>{formatarData(l.dataValidade)}</p>
                      <p className="text-xs text-slate-500">{descreverPrazo(l.dataValidade)}</p>
                    </td>
                    <td className="px-4 py-3"><BadgeLicenca status={calcularStatusLicenca(l.dataValidade)} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/condicionantes?licenca=${l.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:underline"
                        aria-label={`Condicionantes de ${l.numero}`}>
                        <ClipboardCheck className="size-4" aria-hidden />
                        {contar(condicionantesPorLicenca.get(l.id)?.abertas ?? 0, 'em acompanhamento', 'em acompanhamento')}
                      </Link>
                      {(condicionantesPorLicenca.get(l.id)?.vencidas ?? 0) > 0 && (
                        <span className="mt-1 block"><Badge cor="vermelho">{contar(condicionantesPorLicenca.get(l.id)!.vencidas, 'vencida', 'vencidas')}</Badge></span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editavel && pode(sessao?.papel, 'escrever') && <IconButton rotulo={`Editar ${l.numero}`} onClick={() => setModal({ item: l })}><Pencil className="size-4" /></IconButton>}
                      {editavel && pode(sessao?.papel, 'excluir') && <IconButton rotulo={`Excluir ${l.numero}`} onClick={() => setApagar(l)}><Trash2 className="size-4" /></IconButton>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Paginacao pagina={paginaAtual} total={linhas.length} porPagina={porPagina} aoMudar={setPagina} />
      {modal && <LicencaModal item={modal.item} usinas={usinaId ? usinas : ativas} usinaId={usinaId} onFechar={() => setModal(null)} />}
      {apagar && (
        <Confirmar perigo titulo="Excluir licença" rotulo="Excluir" carregando={excluir.isPending}
          mensagem={`Excluir "${apagar.tipo}" (${apagar.numero})? Essa ação não pode ser desfeita.`}
          onFechar={() => setApagar(null)}
          onConfirmar={() => excluir.mutate(apagar.id, { onSuccess: () => setApagar(null) })} />
      )}
    </>
  );
}
