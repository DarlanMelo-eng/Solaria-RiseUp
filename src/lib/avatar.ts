import type { CorAvatar } from '@/schemas/perfil';

export const COR_AVATAR: Record<CorAvatar, string> = {
  ambar: 'bg-amber-400 text-slate-900',
  azul: 'bg-sky-500 text-white',
  verde: 'bg-emerald-500 text-white',
  violeta: 'bg-violet-500 text-white',
  rosa: 'bg-pink-500 text-white',
};

export function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]?.toUpperCase() ?? '').join('') || 'SO';
}
