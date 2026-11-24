import type { ReactNode } from 'react';
import { Card } from './ui';

export function ResumoIndicador({ titulo, valor, detalhe, icone }: { titulo: string; valor: string | number; detalhe: string; icone: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</span>
        <span className="rounded-lg bg-amber-50 p-2 text-amber-700">{icone}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
    </Card>
  );
}
