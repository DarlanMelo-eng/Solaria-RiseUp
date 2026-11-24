import { describe, expect, it, vi } from 'vitest';
import { ordenarPorChave } from '@/utils/ordenacao';
import { diasAte } from '@/utils/datas';
import type { Manutencao, Prioridade } from '@/types/solar';

/*
 * Lote 5: a ordenação de manutenções calculava `diasAte` dentro da comparação
 * (com 30 000 itens, cerca de 777 mil cálculos de data e a tela travada por cerca de 0,5 s a cada tecla).
 * Estes testes garantem que a nova ordenação dá EXATAMENTE a mesma ordem da antiga.
 */

const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };
const AGORA = new Date(2026, 10, 22, 12, 0, 0); // fixo: o teste não depende do dia em que roda

/** Gerador pseudoaleatório com semente: os mesmos dados em toda execução. */
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
function manutencoesDeTeste(quantidade: number, semente = 42): Manutencao[] {
  const aleatorio = gerador(semente);
  const prioridades: Prioridade[] = ['alta', 'media', 'baixa'];
  const prazos = ['2026-11-22', '2026-11-01', '2027-01-15', '2026-12-31', '2025-02-30' /* data inválida */, '2026-11-23'];
  return Array.from({ length: quantidade }, (_, i): Manutencao => ({
    id: `m${i}`,
    usinaId: `u${Math.floor(aleatorio() * 10)}`,
    titulo: `Manutenção ${i}`,
    responsavel: 'Equipe',
    // Poucos prazos e prioridades: força muitos empates, onde a estabilidade importa.
    prazo: prazos[Math.floor(aleatorio() * prazos.length)],
    prioridade: prioridades[Math.floor(aleatorio() * prioridades.length)],
    status: 'pendente',
  }));
}
/** O comparador ANTIGO de manutencoes-view.tsx, com o mesmo "agora" fixo. */
const ordenarComoAntes = (lista: Manutencao[]) => [...lista].sort((a, b) =>
  ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]
  || (diasAte(a.prazo, AGORA) ?? -9999) - (diasAte(b.prazo, AGORA) ?? -9999));
/** A chave NOVA, igual à de manutencoes-view.tsx. */
const chaveManutencao = (m: Manutencao) => [ORDEM_PRIORIDADE[m.prioridade], diasAte(m.prazo, AGORA) ?? -9999];

describe('ordenarPorChave', () => {
  it('dá exatamente a mesma ordem do comparador antigo de manutenções (incluindo empates e data inválida)', () => {
    for (const [quantidade, semente] of [[0, 1], [1, 2], [7, 3], [500, 4], [5000, 5]]) {
      const lista = manutencoesDeTeste(quantidade, semente);
      const antes = ordenarComoAntes(lista).map((m) => m.id);
      const depois = ordenarPorChave(lista, chaveManutencao).map((m) => m.id);
      expect(depois, `${quantidade} itens`).toEqual(antes);
    }
  });

  it('calcula a chave exatamente uma vez por item', () => {
    const lista = manutencoesDeTeste(5000);
    const chave = vi.fn(chaveManutencao);
    ordenarPorChave(lista, chave);
    expect(chave).toHaveBeenCalledTimes(5000);
  });

  it('é estável: itens com a mesma chave mantêm a ordem original', () => {
    const itens = [{ id: 'a', p: 1 }, { id: 'b', p: 0 }, { id: 'c', p: 1 }, { id: 'd', p: 0 }, { id: 'e', p: 1 }];
    expect(ordenarPorChave(itens, (i) => [i.p]).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('compara a chave em ordem: a segunda posição só desempata a primeira', () => {
    const itens = [{ id: 'x', k: [1, 5] }, { id: 'y', k: [0, 9] }, { id: 'z', k: [1, -3] }];
    expect(ordenarPorChave(itens, (i) => i.k).map((i) => i.id)).toEqual(['y', 'z', 'x']);
  });

  it('não altera o array recebido', () => {
    const lista = manutencoesDeTeste(50);
    const copia = lista.map((m) => m.id);
    const ordenada = ordenarPorChave(lista, chaveManutencao);
    expect(lista.map((m) => m.id)).toEqual(copia);
    expect(ordenada).not.toBe(lista);
  });
});
