import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { banco, Transacao } from './index';
import { condicionanteCumprimentos, condicionantes, licencas, usinas, usuarios } from './schema';
import { formatarCumprimento } from './formatar';

/**
 * Trava licença, usina e condicionante, nessa ordem: a mesma das rotas de licença e de
 * condicionante (Lote 9), para não haver deadlock entre elas. "no key update" basta, porque
 * nenhuma rota muda o id; e não bloqueia a conferência de FK de quem insere cumprimentos.
 * Devolve null se a condicionante não existe (ou foi excluída enquanto esperava a trava).
 */
export async function travarCondicionante(tx: Transacao, id: string) {
  const [base] = await tx.select({ licencaId: condicionantes.licencaId }).from(condicionantes).where(eq(condicionantes.id, id));
  if (!base) return null;
  const [licenca] = await tx.select().from(licencas).where(eq(licencas.id, base.licencaId)).for('share');
  if (!licenca) return null;
  const [usina] = await tx.select().from(usinas).where(eq(usinas.id, licenca.usinaId)).for('update');
  const [atual] = await tx.select().from(condicionantes).where(eq(condicionantes.id, id)).for('no key update');
  if (!atual || !usina) return null;
  return { atual, licenca, usina };
}

const cancelador = alias(usuarios, 'cancelador');

/** Histórico de uma condicionante (todos os calendários, cancelados incluídos), do mais recente ao mais antigo. */
export async function buscarCumprimentos(executor: Transacao | typeof banco, condicionanteId: string, cumprimentoId?: string) {
  const linhas = await executor.select({
    cumprimento: condicionanteCumprimentos,
    registradoPorNome: usuarios.nome,
    canceladoPorNome: cancelador.nome,
  }).from(condicionanteCumprimentos)
    .innerJoin(usuarios, eq(usuarios.id, condicionanteCumprimentos.registradoPor))
    .leftJoin(cancelador, eq(cancelador.id, condicionanteCumprimentos.canceladoPor))
    .where(and(eq(condicionanteCumprimentos.condicionanteId, condicionanteId),
      cumprimentoId ? eq(condicionanteCumprimentos.id, cumprimentoId) : undefined))
    .orderBy(desc(condicionanteCumprimentos.registradoEm), desc(condicionanteCumprimentos.id));
  return linhas.map((l) => formatarCumprimento({ ...l.cumprimento, registradoPorNome: l.registradoPorNome, canceladoPorNome: l.canceladoPorNome }));
}
