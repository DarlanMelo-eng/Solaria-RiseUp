'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Activity, Download, Factory, Gauge, Pencil, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { BadgeUsina, Button, Card, Confirmar, ErroCarga, IconButton, inputCls, filtroCls, PageHeader, Skeleton, Vazio, Badge } from '@/components/ui';
import { UsinaModal } from '@/components/formularios';
import { ResumoIndicador } from '@/components/resumo-indicador';
import { Paginacao } from '@/components/paginacao';
import { baixarCsv } from '@/utils/csv';
import { useDados, useExcluirUsina, useSessao } from '@/hooks/useApi';
import { pode } from '@/lib/permissoes';
import { calcularStatusLicenca, formatarCapacidade } from '@/utils/datas';
import type { Usina } from '@/types/solar';
import { contar } from '@/utils/texto';

export default function Usinas() {
  const { data: sessao } = useSessao();
  const { usinas, licencas, manutencoes, carregando, erro, recarregar } = useDados();
  const excluir = useExcluirUsina();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const porPagina = 12;
  const [status, setStatus] = useState('');
  const [ordem, setOrdem] = useState<'nome' | 'capacidade' | 'pendencias'>('nome');
  const [modal, setModal] = useState<{ usina?: Usina } | null>(null);
  const [apagar, setApagar] = useState<Usina | null>(null);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    // Pré-agregação linear: antes cada usina percorria todas as licenças e manutenções.
    const totais = new Map<string, { totalLic: number; criticas: number; abertas: number }>();
    const get = (id: string) => {
      let total = totais.get(id);
      if (!total) { total = { totalLic: 0, criticas: 0, abertas: 0 }; totais.set(id, total); }
      return total;
    };
    for (const l of licencas) {
      const total = get(l.usinaId);
      total.totalLic++;
      if (calcularStatusLicenca(l.dataValidade) !== 'valida') total.criticas++;
    }
    for (const m of manutencoes) if (m.status !== 'concluida') get(m.usinaId).abertas++;
    return usinas
      .filter((u) => (!status || u.status === status) && (!q || `${u.nome} ${u.localizacao}`.toLowerCase().includes(q)))
      .map((u) => ({ u, ...(totais.get(u.id) ?? { totalLic: 0, criticas: 0, abertas: 0 }) }))
      .sort((a, b) => ordem === 'capacidade' ? b.u.capacidadeKwp - a.u.capacidadeKwp : ordem === 'pendencias' ? (b.criticas + b.abertas) - (a.criticas + a.abertas) : a.u.nome.localeCompare(b.u.nome, 'pt-BR'));
  }, [usinas, licencas, manutencoes, busca, status, ordem]);
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(linhas.length / porPagina)));
  const visiveis = linhas.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  if (erro) return <ErroCarga onTentar={recarregar} />;
  const escrever = pode(sessao?.papel, 'escrever');
  const ativas = usinas.filter((u) => u.status === 'ativa');
  const idsAtivas = new Set(ativas.map((u) => u.id));
  const pendentes = licencas.filter((l) => idsAtivas.has(l.usinaId) && calcularStatusLicenca(l.dataValidade) !== 'valida').length;
  const exportar = () => baixarCsv('usinas.csv', ['Nome', 'Localização', 'Capacidade (kWp)', 'Situação', 'Licenças', 'Pendências', 'Manutenções abertas'],
    linhas.map(({ u, totalLic, criticas, abertas }) => [u.nome, u.localizacao, u.capacidadeKwp, u.status, totalLic, criticas, abertas]));

  return (
    <>
      <PageHeader titulo="Usinas" descricao="Veja sua operação em um só lugar, acompanhe pendências e encontre cada usina rapidamente."
        acoes={escrever && <Button variante="primario" onClick={() => setModal({})}><Plus className="size-4" aria-hidden />Nova usina</Button>} />

      <section aria-label="Indicadores das usinas" className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <ResumoIndicador titulo="Usinas cadastradas" valor={carregando ? '—' : usinas.length} detalhe="Total na plataforma" icone={<Factory className="size-5" />} />
        <ResumoIndicador titulo="Em operação" valor={carregando ? '—' : ativas.length} detalhe="Usinas ativas" icone={<Activity className="size-5" />} />
        <ResumoIndicador titulo="Potência instalada" valor={carregando ? '—' : formatarCapacidade(usinas.reduce((total, u) => total + u.capacidadeKwp, 0))} detalhe="Soma das capacidades" icone={<Gauge className="size-5" />} />
        <ResumoIndicador titulo="Licenças em atenção" valor={carregando ? '—' : pendentes} detalhe="Vencidas ou perto do prazo em usinas ativas" icone={<TriangleAlert className="size-5" />} />
      </section>
      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <strong>Como usar:</strong> clique no nome de uma usina para abrir seus detalhes, licenças e manutenções. Usinas inativas continuam visíveis para consulta.
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <input aria-label="Buscar usinas" placeholder="Buscar por nome ou cidade…" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${inputCls} pl-9`} />
        </div>
        <select aria-label="Filtrar por situação" value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }} className={`${filtroCls}`}>
          <option value="">Todas</option><option value="ativa">Ativas</option><option value="inativa">Inativas</option>
        </select>
        <select aria-label="Ordenar usinas" value={ordem} onChange={(e) => { setOrdem(e.target.value as typeof ordem); setPagina(1); }} className={filtroCls}>
          <option value="nome">Ordenar por nome</option><option value="capacidade">Maior capacidade</option><option value="pendencias">Mais pendências</option>
        </select>
        <Button onClick={exportar} disabled={!linhas.length}><Download className="size-4" aria-hidden />Exportar CSV</Button>
      </div>
      <p className="mb-3 text-xs text-slate-500" aria-live="polite">{carregando ? 'Carregando usinas…' : `${linhas.length} de ${contar(usinas.length, 'usina exibida', 'usinas exibidas')}`}</p>

      <Card className="relative overflow-x-auto">
        {carregando ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div> : linhas.length === 0 ? (
          <Vazio titulo="Nenhuma usina encontrada" texto={usinas.length ? 'Ajuste a busca ou o filtro.' : 'Cadastre a primeira usina para começar.'}
            acao={escrever && !usinas.length && <Button variante="primario" onClick={() => setModal({})}>Nova usina</Button>} />
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Usina</th><th className="px-4 py-3">Capacidade</th><th className="px-4 py-3">Licenças</th><th className="px-4 py-3">Manutenções abertas</th><th className="px-4 py-3">Situação</th><th className="w-24 px-4 py-3"><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiveis.map(({ u, totalLic, criticas, abertas }) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/usinas/${u.id}`} className="font-semibold text-slate-900 hover:text-amber-700">{u.nome}</Link>
                    <p className="text-xs text-slate-500">{u.localizacao}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatarCapacidade(u.capacidadeKwp)}</td>
                  <td className="px-4 py-3">{totalLic}{criticas > 0 && u.status === 'ativa' && <span className="ml-2"><Badge cor="vermelho">{contar(criticas, 'pendente', 'pendentes')}</Badge></span>}</td>
                  <td className="px-4 py-3">{abertas}</td>
                  <td className="px-4 py-3"><BadgeUsina status={u.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {escrever && <IconButton rotulo={`Editar ${u.nome}`} onClick={() => setModal({ usina: u })}><Pencil className="size-4" /></IconButton>}
                    {pode(sessao?.papel, 'excluir_usina') && <IconButton rotulo={`Excluir ${u.nome}`} onClick={() => setApagar(u)}><Trash2 className="size-4" /></IconButton>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Paginacao pagina={paginaAtual} total={linhas.length} porPagina={porPagina} aoMudar={setPagina} />
      {modal && <UsinaModal usina={modal.usina} onFechar={() => setModal(null)} />}
      {apagar && (
        <Confirmar perigo titulo="Excluir usina" rotulo="Excluir" carregando={excluir.isPending}
          mensagem={`Excluir "${apagar.nome}"? Só é possível se não houver licenças nem manutenções vinculadas; para preservar o histórico, prefira inativar a usina.`}
          onFechar={() => setApagar(null)} onConfirmar={() => excluir.mutate(apagar.id, { onSuccess: () => setApagar(null) })} />
      )}
    </>
  );
}
