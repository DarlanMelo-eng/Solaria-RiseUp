'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';

/** Paginação local: limita os elementos montados sem quebrar filtros ou exportação. */
export function Paginacao({ pagina, total, porPagina, aoMudar }: {
  pagina: number;
  total: number;
  porPagina: number;
  aoMudar: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(pagina, paginas);
  if (paginas <= 1) return null;
  return (
    <nav aria-label="Paginação de resultados" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm text-slate-600">
        Mostrando <strong>{(atual - 1) * porPagina + 1}–{Math.min(atual * porPagina, total)}</strong> de <strong>{total}</strong> registros
      </p>
      <div className="flex items-center gap-2">
        <Button disabled={atual <= 1} onClick={() => aoMudar(atual - 1)} aria-label="Página anterior">
          <ChevronLeft className="size-4" aria-hidden /> Anterior
        </Button>
        <span className="min-w-14 text-center text-xs font-semibold text-slate-600">{atual} / {paginas}</span>
        <Button disabled={atual >= paginas} onClick={() => aoMudar(atual + 1)} aria-label="Próxima página">
          Próxima <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
