import { describe, expect, it } from 'vitest';
import { mesclarLista } from '@/lib/mesclar-lista';

type Item = { id: string; nome: string };
const originais: Item[] = [{ id: '1', nome: 'Usina A' }, { id: '2', nome: 'Usina B' }];

describe('Atualização de lista após resposta bem-sucedida da API', () => {
  it('inclui um cadastro sem alterar dados anteriores', () => {
    const novo = mesclarLista(originais, 'criar', { id: '3', nome: 'Usina C' });
    expect(novo.map((u) => u.id)).toEqual(['1', '2', '3']);
    expect(originais).toHaveLength(2);
  });
  it('não duplica o mesmo registro', () => {
    expect(mesclarLista(originais, 'criar', originais[0])).toEqual(originais);
  });
  it('atualiza somente o registro editado', () => {
    expect(mesclarLista(originais, 'editar', { id: '2', nome: 'Novo nome' }))
      .toEqual([{ id: '1', nome: 'Usina A' }, { id: '2', nome: 'Novo nome' }]);
  });
  it('exclui somente o registro confirmado pelo servidor', () => {
    expect(mesclarLista(originais, 'excluir', undefined, '1'))
      .toEqual([{ id: '2', nome: 'Usina B' }]);
  });
  it('não altera nada sem registro retornado para criar ou editar', () => {
    expect(mesclarLista(originais, 'criar')).toEqual(originais);
    expect(mesclarLista(originais, 'editar')).toEqual(originais);
  });
});
