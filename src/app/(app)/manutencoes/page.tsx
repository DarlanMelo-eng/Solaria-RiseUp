'use client';
import { useSearchParams } from 'next/navigation';
import { ManutencoesView, type Situacao } from '@/components/manutencoes-view';
import { PageHeader } from '@/components/ui';

const SITUACOES: Situacao[] = ['abertas', 'atrasadas', 'concluidas'];

export default function PaginaManutencoes() {
  const s = useSearchParams().get('situacao');
  const inicial = SITUACOES.find((x) => x === s) ?? 'todas';
  return (
    <>
      <PageHeader titulo="Manutenções" descricao="Quadro de serviços por status, prioridade e prazo." />
      <ManutencoesView situacaoInicial={inicial} />
    </>
  );
}
