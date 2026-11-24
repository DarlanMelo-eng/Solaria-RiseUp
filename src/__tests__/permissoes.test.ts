import { describe, it, expect } from 'vitest';
import { pode, type Permissao } from '@/lib/permissoes';
import type { Papel } from '@/types/solar';

const papeis: Papel[] = ['admin', 'gestor', 'consulta'];
const permissoes: Permissao[] = ['escrever', 'excluir', 'excluir_usina', 'gerir_usuarios'];
describe('matriz de permissões', () => {
  for (const papel of papeis) for (const permissao of permissoes) {
    it(`${papel} / ${permissao}`, () => {
      expect(pode(papel, permissao)).toBe(papel === 'admin' ||
        (papel === 'gestor' && ['escrever', 'excluir'].includes(permissao)));
    });
  }
});
