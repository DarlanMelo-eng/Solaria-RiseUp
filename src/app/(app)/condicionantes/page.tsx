'use client';
import { useSearchParams } from 'next/navigation';
import { CondicionantesView, SITUACOES_FILTRO, type FiltroSituacao } from '@/components/condicionantes-view';
import { PageHeader } from '@/components/ui';

export default function PaginaCondicionantes() {
  const parametros = useSearchParams();
  const s = parametros.get('situacao');
  const situacao: FiltroSituacao = SITUACOES_FILTRO.find((x) => x === s) ?? '';
  return (
    <>
      <PageHeader titulo="Condicionantes" descricao="Obrigações das licenças ambientais: prazos, cumprimentos e histórico." />
      {/* `key`: ao chegar por um atalho de outra licença, os filtros recomeçam a partir da URL. */}
      <CondicionantesView key={parametros.toString()} licencaInicial={parametros.get('licenca') ?? ''} situacaoInicial={situacao} />
    </>
  );
}
