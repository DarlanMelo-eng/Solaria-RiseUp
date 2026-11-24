'use client';
import { useSearchParams } from 'next/navigation';
import { LicencasView } from '@/components/licencas-view';
import { PageHeader } from '@/components/ui';

const STATUS = ['valida', 'proximo_vencimento', 'expirada'] as const;

export default function PaginaLicencas() {
  const s = useSearchParams().get('status');
  const inicial = STATUS.find((x) => x === s) ?? 'todas';
  return (
    <>
      <PageHeader titulo="Licenças" descricao="Acompanhe validades e vencimentos de todas as usinas." />
      <LicencasView statusInicial={inicial} />
    </>
  );
}
