'use client';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, Lock, MapPin, Pencil } from 'lucide-react';
import { BadgeUsina, Button, Card, ErroCarga, PageHeader, Skeleton, Vazio, cx } from '@/components/ui';
import { UsinaModal } from '@/components/formularios';
import { CondicionantesView } from '@/components/condicionantes-view';
import { LicencasView } from '@/components/licencas-view';
import { ManutencoesView } from '@/components/manutencoes-view';
import { useDados, useSessao } from '@/hooks/useApi';
import { pode } from '@/lib/permissoes';
import { calcularStatusLicenca, formatarCapacidade, manutencaoAtrasada, montarAlertas } from '@/utils/datas';
import { Link2 } from 'lucide-react';
import { contar } from '@/utils/texto';

const ABAS = [
  { id: 'visao', rotulo: 'Visão geral' },
  { id: 'licencas', rotulo: 'Licenças' },
  { id: 'condicionantes', rotulo: 'Condicionantes' },
  { id: 'manutencoes', rotulo: 'Manutenções' },
] as const;

export default function DetalheUsina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const busca = useSearchParams();
  const aba = ABAS.find((a) => a.id === busca.get('aba'))?.id ?? 'visao';
  const { data: sessao } = useSessao();
  const { usinas, licencas, manutencoes, carregando, erro, recarregar } = useDados();
  const [editando, setEditando] = useState(false);

  const usina = usinas.find((u) => u.id === id);
  const info = useMemo(() => {
    const lic = licencas.filter((l) => l.usinaId === id);
    const man = manutencoes.filter((m) => m.usinaId === id);
    return {
      lic: lic.length,
      pendentes: lic.filter((l) => calcularStatusLicenca(l.dataValidade) !== 'valida').length,
      abertas: man.filter((m) => m.status !== 'concluida').length,
      atrasadas: man.filter((m) => manutencaoAtrasada(m)).length,
      alertas: montarAlertas(usinas, licencas, manutencoes).filter((a) => a.usinaId === id),
    };
  }, [usinas, licencas, manutencoes, id]);

  if (erro) return <ErroCarga onTentar={recarregar} />;
  if (carregando) return <Skeleton className="h-64" />;
  if (!usina) {
    return (
      <Card><Vazio titulo="Usina não encontrada" texto="Ela pode ter sido excluída." acao={<Link href="/usinas" className="font-semibold text-amber-700 hover:underline">Voltar para usinas</Link>} /></Card>
    );
  }
  const somenteLeitura = usina.status === 'inativa';

  return (
    <>
      <Link href="/usinas" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Usinas</Link>
      <PageHeader titulo={usina.nome}
        descricao={`${usina.localizacao} · ${formatarCapacidade(usina.capacidadeKwp)}`}
        acoes={<><BadgeUsina status={usina.status} />{pode(sessao?.papel, 'escrever') && <Button onClick={() => setEditando(true)}><Pencil className="size-4" aria-hidden />Editar</Button>}</>} />

      {somenteLeitura && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <Lock className="size-4 shrink-0" aria-hidden /> Usina inativa: licenças, condicionantes e manutenções ficam somente para consulta. Reative-a para fazer alterações.
        </div>
      )}

      <div role="tablist" aria-label="Seções da usina" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => router.replace(`${pathname}?aba=${a.id}`, { scroll: false })}
            className={cx('-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition', aba === a.id ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'visao' && (
        <div className="space-y-6" role="tabpanel">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Capacidade', formatarCapacidade(usina.capacidadeKwp)],
              ['Licenças', `${info.lic}${info.pendentes ? ` · ${contar(info.pendentes, 'pendente', 'pendentes')}` : ''}`],
              ['Manutenções em aberto', String(info.abertas)],
              ['Atrasadas', String(info.atrasadas)],
            ].map(([t, v]) => (
              <Card key={t} className="p-5"><p className="text-sm text-slate-500">{t}</p><p className="mt-1 text-2xl font-bold text-slate-900">{v}</p></Card>
            ))}
          </div>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900"><MapPin className="size-4 text-amber-500" aria-hidden />Requer atenção</h2>
            {info.alertas.length === 0 ? <p className="py-4 text-sm text-slate-500">{somenteLeitura ? 'Usinas inativas não geram alertas.' : 'Nenhuma pendência para esta usina.'}</p> : (
              <ul className="mt-3 divide-y divide-slate-100">
                {info.alertas.map((a) => (
                  <li key={a.id}><Link href={a.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-amber-700"><span><span className="font-medium">{a.titulo}</span><span className="block text-xs text-slate-500">{a.detalhe}</span></span><Link2 className="size-4 text-slate-300" aria-hidden /></Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      {aba === 'licencas' && <div role="tabpanel"><LicencasView usinaId={id} /></div>}
      {aba === 'condicionantes' && <div role="tabpanel"><CondicionantesView usinaId={id} /></div>}
      {aba === 'manutencoes' && <div role="tabpanel"><ManutencoesView usinaId={id} /></div>}

      {editando && <UsinaModal usina={usina} onFechar={() => setEditando(false)} />}
    </>
  );
}
