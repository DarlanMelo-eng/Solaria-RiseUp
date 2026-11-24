import { sql } from 'drizzle-orm';
import { atividades } from './schema';
import type { Transacao } from './index';

/** Chamar dentro da mesma transação da alteração de negócio. */
export async function registrar(tx: Transacao, usuario: string, descricao: string) {
  await tx.insert(atividades).values({ usuario, descricao });
  await tx.delete(atividades).where(sql`${atividades.id} NOT IN
    (SELECT id FROM atividades ORDER BY em DESC, id DESC LIMIT 50)`);
}
