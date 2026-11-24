import { SunMedium } from 'lucide-react';
import { cx } from '@/lib/cx';

/** Símbolo e nome do Solaria: o mesmo em todas as telas (página pública, acesso e menu lateral). */
export function Marca({ tom = 'escuro', compacta, className }: { tom?: 'claro' | 'escuro'; compacta?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-3', className)}>
      <span className="marca-simbolo" aria-hidden><SunMedium className="size-6" strokeWidth={2.2} /></span>
      {!compacta && (
        <span className={cx('text-[1.15rem] font-extrabold tracking-[-0.05em]', tom === 'claro' ? 'text-white' : 'text-marca-950')}>
          solaria
          {/* Em celulares bem estreitos, só "solaria" para caber ao lado do botão. */}
          <span className={cx('hidden font-medium min-[400px]:inline', tom === 'claro' ? 'text-marca-200/70' : 'text-slate-400')}>/management</span>
        </span>
      )}
    </span>
  );
}
