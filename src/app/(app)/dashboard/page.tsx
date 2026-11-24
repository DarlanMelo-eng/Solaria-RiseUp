'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, ChevronRight, ShieldCheck, Sun, Wrench, Zap } from 'lucide-react';
import { Card, ErroCarga, PageHeader, Skeleton, Vazio, cx } from '@/components/ui';
import { useAtividades, useDados, useSessao } from '@/hooks/useApi';
import { calcularStatusLicenca, formatarCapacidade, formatarDataHora, manutencaoAtrasada, montarAlertas } from '@/utils/datas';
import { contar } from '@/utils/texto';

function Kpi({ href, titulo, valor, detalhe, Icone, destaque }: { href: string; titulo: string; valor: string; detalhe: string; Icone: typeof Sun; destaque?: boolean }) {
  return (
    <Link href={href} className="group block">
      <Card className={cx('h-full p-4 transition sm:p-5 group-hover:border-amber-400 group-hover:shadow-md', destaque && 'border-red-300 bg-red-50/60')}>
        <div className="flex items-start justify-between gap-2 text-xs font-medium text-slate-500 sm:text-sm">
          {titulo}
          <Icone className={cx('size-5 shrink-0', destaque ? 'text-red-500' : 'text-amber-500')} aria-hidden />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{valor}</p>
        <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { data: sessao } = useSessao();
  const { usinas, licencas, manutencoes, carregando, erro, recarregar } = useDados();
  const atividades = useAtividades();

  const r = useMemo(() => {
    const ativas = usinas.filter((u) => u.status === 'ativa');
    const idsAtivos = new Set(ativas.map((u) => u.id));
    const licAtivas = licencas.filter((l) => idsAtivos.has(l.usinaId));
    const manAbertas = manutencoes.filter((m) => idsAtivos.has(m.usinaId) && m.status !== 'concluida');
    const contagem = { valida: 0, proximo_vencimento: 0, expirada: 0 };
    licAtivas.forEach((l) => contagem[calcularStatusLicenca(l.dataValidade)]++);
    return {
      ativas,
      contagem,
      totalLic: licAtivas.length,
      kwp: ativas.reduce((s, u) => s + u.capacidadeKwp, 0),
      abertas: manAbertas.length,
      atrasadas: manAbertas.filter((m) => manutencaoAtrasada(m)).length,
      alertas: montarAlertas(usinas, licencas, manutencoes),
    };
  }, [usinas, licencas, manutencoes]);

  if (erro) return <ErroCarga onTentar={recarregar} />;
  const maior = Math.max(...r.ativas.map((u) => u.capacidadeKwp), 1);
  const pendentes = r.contagem.expirada + r.contagem.proximo_vencimento;

  return (
    <>
      <PageHeader titulo={`Olá, ${sessao?.nome.split(' ')[0] ?? ''}`.trim()} descricao="Visão geral da operação e das pendências de compliance." />

      {!carregando && usinas.length === 0 && (
        <Card className="mb-5 border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-slate-900">Comece por aqui</h2>
          <p className="mt-1 text-sm text-slate-600">Cadastre sua primeira usina. Depois, organize as licenças e programe as manutenções.</p>
          <Link href="/usinas" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-800 hover:underline">
            Abrir gestão de usinas <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Card>
      )}
      {carregando ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Kpi href="/usinas" titulo="Usinas ativas" valor={String(r.ativas.length)} detalhe={`de ${contar(usinas.length, 'cadastrada', 'cadastradas')}`} Icone={Sun} />
          <Kpi href="/usinas" titulo="Capacidade em operação" valor={formatarCapacidade(r.kwp)} detalhe="somando usinas ativas" Icone={Zap} />
          <Kpi href={r.contagem.expirada ? '/licencas?status=expirada' : '/licencas?status=proximo_vencimento'} titulo="Licenças com pendência" valor={String(pendentes)}
            detalhe={`${contar(r.contagem.expirada, 'expirada', 'expiradas')} · ${r.contagem.proximo_vencimento} vencendo`} Icone={ShieldCheck} destaque={r.contagem.expirada > 0} />
          <Kpi href={r.atrasadas ? '/manutencoes?situacao=atrasadas' : '/manutencoes?situacao=abertas'} titulo="Manutenções em aberto" valor={String(r.abertas)}
            detalhe={r.atrasadas ? contar(r.atrasadas, 'atrasada', 'atrasadas') : 'nenhuma atrasada'} Icone={Wrench} destaque={r.atrasadas > 0} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="font-semibold text-slate-900">Licenças por situação</h2>
            <p className="text-xs text-slate-500">Somente usinas ativas</p>
            {r.totalLic === 0 ? (
              <Vazio titulo="Sem licenças cadastradas" />
            ) : (
              <>
                <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-100" role="img"
                  aria-label={`${r.contagem.valida} válidas, ${r.contagem.proximo_vencimento} vencem em breve, ${r.contagem.expirada} expiradas`}>
                  <div className="bg-emerald-500" style={{ width: `${(r.contagem.valida / r.totalLic) * 100}%` }} />
                  <div className="bg-amber-400" style={{ width: `${(r.contagem.proximo_vencimento / r.totalLic) * 100}%` }} />
                  <div className="bg-red-500" style={{ width: `${(r.contagem.expirada / r.totalLic) * 100}%` }} />
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                  <li><span className="mr-2 inline-block size-2.5 rounded-full bg-emerald-500" />{contar(r.contagem.valida, 'válida', 'válidas')}</li>
                  <li><span className="mr-2 inline-block size-2.5 rounded-full bg-amber-400" />{r.contagem.proximo_vencimento} {r.contagem.proximo_vencimento === 1 ? 'vence' : 'vencem'} em breve</li>
                  <li><span className="mr-2 inline-block size-2.5 rounded-full bg-red-500" />{contar(r.contagem.expirada, 'expirada', 'expiradas')}</li>
                </ul>
              </>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-slate-900">Capacidade por usina</h2>
            <ul className="mt-4 space-y-3">
              {[...r.ativas].sort((a, b) => b.capacidadeKwp - a.capacidadeKwp).slice(0, 8).map((u) => (
                <li key={u.id}>
                  <Link href={`/usinas/${u.id}`} className="group block">
                    <div className="flex justify-between text-sm"><span className="font-medium text-slate-800 group-hover:text-amber-700">{u.nome}</span><span className="text-slate-500">{formatarCapacidade(u.capacidadeKwp)}</span></div>
                    <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${(u.capacidadeKwp / maior) * 100}%` }} /></div>
                  </Link>
                </li>
              ))}
              {!carregando && r.ativas.length === 0 && <Vazio titulo="Nenhuma usina ativa" texto="Cadastre ou reative uma usina para começar o acompanhamento." />}
              {r.ativas.length > 8 && <li><Link href="/usinas" className="text-sm font-semibold text-amber-700 hover:underline">Ver todas as {r.ativas.length} usinas</Link></li>}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Requer atenção</h2>
              <Link href="/alertas" className="text-xs font-semibold text-amber-700 hover:underline">Ver todos</Link>
            </div>
            {r.alertas.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Tudo em dia 🎉</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {r.alertas.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link href={a.href} className="flex items-center gap-3 py-2.5 hover:text-amber-700">
                      <AlertTriangle className={cx('size-4 shrink-0', a.gravidade === 'critica' ? 'text-red-500' : 'text-amber-500')} aria-hidden />
                      <span className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium">{a.titulo}</span><span className="block text-xs text-slate-500">{a.detalhe}</span></span>
                      <ChevronRight className="size-4 text-slate-300" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-slate-900">Atividade recente</h2>
            <ul className="mt-3 space-y-3">
              {atividades.isPending && <Skeleton className="h-16" />}
              {!atividades.isPending && !atividades.data?.length && <li className="text-sm text-slate-500">As alterações realizadas no sistema aparecerão aqui.</li>}
              {atividades.data?.slice(0, 6).map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="text-slate-800"><span className="font-medium">{a.usuario}</span> · {a.descricao}</p>
                  <p className="text-xs text-slate-400">{formatarDataHora(a.em)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
