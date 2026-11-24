'use client';
import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { Prioridade, StatusLicenca, StatusManutencao, StatusUsina } from '@/types/solar';

export { cx };

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500';

/** Selects de filtro: largura do conteúdo (a classe base usa w-full). */
export const filtroCls = inputCls.replace('w-full', 'w-auto');

const VARIANTES = {
  primario: 'bg-sol-400 text-marca-950 hover:bg-sol-300 font-semibold shadow-sm shadow-sol-500/20',
  secundario: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  perigo: 'bg-red-600 text-white hover:bg-red-500 font-semibold',
  fantasma: 'text-slate-600 hover:bg-slate-100',
};

export function Button({ variante = 'secundario', carregando, className, children, disabled, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof VARIANTES; carregando?: boolean }) {
  return (
    <button type="button" disabled={disabled || carregando} aria-busy={carregando || undefined} {...p}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50', VARIANTES[variante], className)}>
      {carregando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export const IconButton = ({ rotulo, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { rotulo: string }) => (
  <button type="button" aria-label={rotulo} title={rotulo} {...p}
    className={cx('rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40', className)} />
);

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...p} className={cx('rounded-2xl border border-slate-200 bg-white shadow-sm', className)} />
);

export function PageHeader({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <title>{`${titulo} · Solaria Management`}</title>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function Campo({ rotulo, id, erro, children, dica }: { rotulo: string; id: string; erro?: string; dica?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</label>
      {children}
      {dica && !erro && <p className="mt-1 text-xs text-slate-500">{dica}</p>}
      {erro && <p id={`${id}-erro`} role="alert" className="mt-1 text-xs font-medium text-red-600">{erro}</p>}
    </div>
  );
}

const BADGE = {
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amarelo: 'bg-amber-50 text-amber-800 ring-amber-600/30',
  vermelho: 'bg-red-50 text-red-700 ring-red-600/20',
  azul: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  cinza: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};
export const Badge = ({ cor, children }: { cor: keyof typeof BADGE; children: React.ReactNode }) => (
  <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE[cor])}>{children}</span>
);

export const BadgeLicenca = ({ status }: { status: StatusLicenca }) =>
  status === 'valida' ? <Badge cor="verde">Válida</Badge> : status === 'proximo_vencimento' ? <Badge cor="amarelo">Vence em breve</Badge> : <Badge cor="vermelho">Expirada</Badge>;
export const BadgeUsina = ({ status }: { status: StatusUsina }) => <Badge cor={status === 'ativa' ? 'verde' : 'cinza'}>{status === 'ativa' ? 'Ativa' : 'Inativa'}</Badge>;
export const BadgePrioridade = ({ p }: { p: Prioridade }) => <Badge cor={p === 'alta' ? 'vermelho' : p === 'media' ? 'amarelo' : 'cinza'}>{p === 'alta' ? 'Alta' : p === 'media' ? 'Média' : 'Baixa'}</Badge>;
export const ROTULO_STATUS_MANUTENCAO: Record<StatusManutencao, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('animate-pulse rounded-lg bg-slate-200', className)} aria-hidden />;

export function Vazio({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <p className="font-semibold text-slate-800">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-slate-500">{texto}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function ErroCarga({ onTentar }: { onTentar: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 border-red-200 bg-red-50 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="size-8 text-red-500" aria-hidden />
      <p className="font-semibold text-red-800">Não foi possível carregar os dados.</p>
      <p className="max-w-md text-sm text-red-700">Confira sua conexão e tente novamente. Se persistir, verifique se o servidor e o PostgreSQL estão ativos.</p>
      <Button onClick={onTentar}>Tentar novamente</Button>
    </Card>
  );
}

/** Usa <dialog> nativo: foco preso, Esc fecha e o restante da página fica inerte. Monte só quando for abrir. */
export function Modal({ titulo, onFechar, children, largura = 'max-w-lg' }: { titulo: string; onFechar: () => void; children: React.ReactNode; largura?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={idTitulo}
      onCancel={(e) => { e.preventDefault(); onFechar(); }}
      onClick={(e) => { if (e.target === ref.current) onFechar(); }}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-2xl', largura)}>
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={idTitulo} className="text-lg font-bold text-slate-900">{titulo}</h2>
          <IconButton rotulo="Fechar" onClick={onFechar} className="-m-2"><X className="size-5" /></IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Confirmar({ titulo, mensagem, rotulo, perigo, carregando, onConfirmar, onFechar }: { titulo: string; mensagem: string; rotulo: string; perigo?: boolean; carregando?: boolean; onConfirmar: () => void; onFechar: () => void }) {
  return (
    <Modal titulo={titulo} onFechar={() => { if (!carregando) onFechar(); }} largura="max-w-md">
      <p className="text-sm text-slate-600">{mensagem}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button disabled={carregando} onClick={onFechar}>Cancelar</Button>
        <Button variante={perigo ? 'perigo' : 'primario'} carregando={carregando} onClick={onConfirmar}>{rotulo}</Button>
      </div>
    </Modal>
  );
}

export const TelaCarregando = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Carregando">
    <Skeleton className="h-8 w-56" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
    <Skeleton className="h-64" />
  </div>
);
