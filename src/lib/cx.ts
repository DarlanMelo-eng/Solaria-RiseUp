/** Junta classes CSS ignorando valores falsos: cx('a', ativo && 'b'). */
export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');
