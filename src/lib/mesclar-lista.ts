/**
 * Mantém a tela consistente após o servidor confirmar a operação.
 * Sem atualização especulativa: erros 403/409 não alteram a lista.
 */
export function mesclarLista<T extends { id: string }>(
  atual: T[],
  acao: 'criar' | 'editar' | 'excluir',
  novo?: T,
  id?: string,
): T[] {
  if (acao === 'excluir') return atual.filter((item) => item.id !== id);
  if (!novo) return atual;
  if (acao === 'criar') return atual.some((item) => item.id === novo.id) ? atual : [...atual, novo];
  return atual.map((item) => item.id === novo.id ? novo : item);
}
