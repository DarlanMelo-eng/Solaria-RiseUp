import type { Papel } from '@/types/solar';

export type Permissao = 'escrever' | 'excluir' | 'excluir_usina' | 'gerir_usuarios';

const mapa: Record<Papel, Permissao[]> = {
  admin: ['escrever', 'excluir', 'excluir_usina', 'gerir_usuarios'],
  gestor: ['escrever', 'excluir'],
  consulta: [],
};

export const pode = (papel: Papel | undefined, permissao: Permissao) =>
  !!papel && mapa[papel].includes(permissao);

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  consulta: 'Consulta',
};
