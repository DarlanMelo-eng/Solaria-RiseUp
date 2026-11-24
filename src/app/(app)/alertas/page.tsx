'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, ChevronRight, CircleCheck, Clock3, ShieldCheck, Wrench } from 'lucide-react';
import { Badge, Card, ErroCarga, PageHeader, Skeleton, Vazio } from '@/components/ui';
import { ResumoIndicador } from '@/components/resumo-indicador';
import { useDados } from '@/hooks/useApi';
import { montarAlertas, type Alerta } from '@/utils/datas';

function Grupo({ titulo, itens, cor }: { titulo: string; itens: Alerta[]; cor: 'vermelho' | 'amarelo' }) {
  if (!itens.length) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">{titulo} <Badge cor={cor}>{itens.length}</Badge></h2>
      <Card className="divide-y divide-slate-100">
        {itens.map((a) => (
          <Link key={a.id} href={a.href} className="flex items-center gap-4 p-4 hover:bg-slate-50">
            <span className={`rounded-lg p-2 ${cor === 'vermelho' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
              {a.tipo === 'licenca' ? <ShieldCheck className="size-5" aria-hidden /> : <Wrench className="size-5" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{a.titulo}</span><span className="block text-sm text-slate-500">{a.detalhe}</span></span>
            <Badge cor="cinza">{a.tipo === 'licenca' ? 'Licença' : 'Manutenção'}</Badge>
            <ChevronRight className="size-4 text-slate-300" aria-hidden />
          </Link>
        ))}
      </Card>
    </section>
  );
}

export default function Alertas() {
  const { usinas, licencas, manutencoes, carregando, erro, recarregar } = useDados();
  const alertas = useMemo(() => montarAlertas(usinas, licencas, manutencoes), [usinas, licencas, manutencoes]);
  const criticos = useMemo(() => alertas.filter((a) => a.gravidade === 'critica'), [alertas]);
  const atencao = useMemo(() => alertas.filter((a) => a.gravidade === 'atencao'), [alertas]);
  if (erro) return <ErroCarga onTentar={recarregar} />;
  return (
    <>
      <PageHeader titulo="Alertas" descricao="Licenças expiradas ou a vencer em até 15 dias e manutenções atrasadas ou com prazo em até 7 dias. Usinas inativas não geram alertas." />
      <section aria-label="Resumo de alertas" className="mb-5 grid gap-3 sm:grid-cols-3">
        <ResumoIndicador titulo="Total de alertas" valor={carregando ? '—' : alertas.length} detalhe="Pendências de usinas ativas" icone={<AlertTriangle className="size-5" />} />
        <ResumoIndicador titulo="Críticos" valor={carregando ? '—' : criticos.length} detalhe="Exigem ação prioritária" icone={<Clock3 className="size-5" />} />
        <ResumoIndicador titulo="Em atenção" valor={carregando ? '—' : atencao.length} detalhe="Antecipe-se ao vencimento" icone={<CircleCheck className="size-5" />} />
      </section>
      {carregando ? <Skeleton className="h-48" /> : alertas.length === 0 ? (
        <Card><Vazio titulo="Tudo em dia" texto="Nenhuma licença ou manutenção exige ação agora." /></Card>
      ) : (
        <>
          <Grupo titulo="Críticos" cor="vermelho" itens={criticos} />
          <Grupo titulo="Atenção" cor="amarelo" itens={atencao} />
        </>
      )}
    </>
  );
}
