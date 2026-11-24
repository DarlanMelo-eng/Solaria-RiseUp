'use client';
import { useState, type ReactNode } from 'react';
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Paginacao } from './paginacao';
import { cx } from './ui';

export type { ColumnDef, SortingState } from '@tanstack/react-table';

/** Classe extra por coluna (largura, alinhamento). Fica em `meta`, que o TanStack Table repassa sem tocar. */
export interface MetaColuna { className?: string }

interface PropsTabela<T> {
  dados: T[];
  colunas: ColumnDef<T>[];
  /** Nome da tabela para leitores de tela (vira o <caption>, escondido). */
  rotulo: string;
  idDaLinha: (linha: T) => string;
  porPagina?: number;
  ordenacaoInicial?: SortingState;
  /** Mostrado no lugar da tabela quando não há linhas (normalmente um <Vazio />). */
  vazio?: ReactNode;
  larguraMinima?: string;
}

/**
 * Tabela reutilizável sobre o TanStack Table: ordenação clicando no cabeçalho e paginação local,
 * com o mesmo visual das tabelas atuais. Filtros e busca ficam com a tela, que passa `dados` já filtrados.
 * Coluna sem `accessorFn`/`accessorKey` (por exemplo, a de ações) não é ordenável.
 */
export function Tabela<T>({ dados, colunas, rotulo, idDaLinha, porPagina = 10, ordenacaoInicial = [], vazio, larguraMinima = 'min-w-[720px]' }: PropsTabela<T>) {
  const [ordenacao, setOrdenacao] = useState<SortingState>(ordenacaoInicial);
  const [pagina, setPagina] = useState({ pageIndex: 0, pageSize: porPagina });
  // O TanStack Table devolve uma instância que muda por dentro, e o React Compiler avisa que não pode
  // memorizá-la. É o uso esperado da biblioteca: o componente renderiza de novo a cada mudança de estado.
  // eslint-disable-next-line react-hooks/incompatible-library
  const tabela = useReactTable({
    data: dados,
    columns: colunas,
    state: { sorting: ordenacao, pagination: pagina },
    onSortingChange: setOrdenacao,
    onPaginationChange: setPagina,
    getRowId: idDaLinha,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (dados.length === 0 && vazio) return <>{vazio}</>;

  return (
    <>
      <div className="relative overflow-x-auto">
        <table className={cx('w-full text-left text-sm', larguraMinima)}>
          <caption className="sr-only">{rotulo}</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {tabela.getHeaderGroups().map((grupo) => (
              <tr key={grupo.id}>
                {grupo.headers.map((cabecalho) => {
                  const coluna = cabecalho.column;
                  const meta = coluna.columnDef.meta as MetaColuna | undefined;
                  const sentido = coluna.getIsSorted();
                  const conteudo = cabecalho.isPlaceholder ? null : flexRender(coluna.columnDef.header, cabecalho.getContext());
                  return (
                    <th key={cabecalho.id} scope="col" className={cx('px-4 py-3', meta?.className)}
                      aria-sort={sentido === 'asc' ? 'ascending' : sentido === 'desc' ? 'descending' : undefined}>
                      {coluna.getCanSort() ? (
                        <button type="button" onClick={coluna.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500">
                          {conteudo}
                          {sentido === 'asc' ? <ArrowUp className="size-3" aria-hidden />
                            : sentido === 'desc' ? <ArrowDown className="size-3" aria-hidden />
                              : <ArrowUpDown className="size-3 opacity-40" aria-hidden />}
                        </button>
                      ) : conteudo}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tabela.getRowModel().rows.map((linha) => (
              <tr key={linha.id} className="hover:bg-slate-50">
                {linha.getVisibleCells().map((celula) => (
                  <td key={celula.id} className={cx('px-4 py-3', (celula.column.columnDef.meta as MetaColuna | undefined)?.className)}>
                    {flexRender(celula.column.columnDef.cell, celula.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao pagina={pagina.pageIndex + 1} total={dados.length} porPagina={pagina.pageSize}
        aoMudar={(n) => setPagina((p) => ({ ...p, pageIndex: n - 1 }))} />
    </>
  );
}
