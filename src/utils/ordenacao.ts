/**
 * Ordena calculando a chave de cada item UMA vez, e não a cada comparação.
 *
 * Por que existe: `lista.sort((a, b) => diasAte(a.prazo) - diasAte(b.prazo))` chama `diasAte` duas vezes
 * por comparação. Com 30 000 manutenções são cerca de 389 mil comparações (777 mil cálculos de data,
 * cerca de 0,5 s com a tela travada). Aqui são 30 000 cálculos.
 *
 * - A chave é uma lista de números comparados em ordem: [prioridade, dias] ordena por prioridade e,
 *   no empate, por dias. Todas as chaves devem ter o mesmo tamanho.
 * - Estável: itens com a mesma chave mantêm a ordem original (igual ao Array.prototype.sort).
 * - Não altera o array recebido; devolve um novo.
 */
export function ordenarPorChave<T>(itens: readonly T[], chave: (item: T) => readonly number[]): T[] {
  const decorados = itens.map((item, posicao) => ({ item, chave: chave(item), posicao }));
  decorados.sort((a, b) => {
    for (let i = 0; i < a.chave.length; i++) {
      const diferenca = a.chave[i] - b.chave[i];
      if (diferenca !== 0) return diferenca;
    }
    return a.posicao - b.posicao;
  });
  return decorados.map((d) => d.item);
}
