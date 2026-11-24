import { NextResponse, type NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { usinaSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { licencas, manutencoes, usinas } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { codigoPostgres } from '@/lib/db/erros';
import { formatarUsina } from '@/lib/db/formatar';
import { erro, exigir, falhou, idValido, lerCorpo, type Contexto } from '@/lib/http';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const [u] = await banco.select().from(usinas).where(eq(usinas.id, id)).limit(1);
  return u ? NextResponse.json(formatarUsina(u)) : erro('Usina não encontrada', 404);
}
export async function PATCH(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const corpo = await lerCorpo(req, usinaSchema.partial());
  if (!corpo.ok) return corpo.resposta;
  try {
    return await banco.transaction(async (tx) => {
      const [atual] = await tx.select().from(usinas).where(eq(usinas.id, id)).for('update');
      if (!atual) return erro('Usina não encontrada', 404);
      const [novo] = await tx.update(usinas).set(corpo.dados).where(eq(usinas.id, id)).returning();
      await registrar(tx, sessao.nome, atual.status !== novo.status
        ? `${novo.status === 'ativa' ? 'Reativou' : 'Inativou'} a usina ${novo.nome}`
        : `Editou a usina ${novo.nome}`);
      return NextResponse.json(formatarUsina(novo));
    });
  } catch (e) {
    if (codigoPostgres(e) === '23505') return erro('Já existe uma usina com esse nome', 409, { nome: 'Nome já utilizado' });
    throw e;
  }
}
export async function DELETE(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'excluir_usina');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  try {
    return await banco.transaction(async (tx) => {
      const [atual] = await tx.select().from(usinas).where(eq(usinas.id, id)).for('update');
      if (!atual) return erro('Usina não encontrada', 404);
      const [tem] = await tx.select({ existe: sql<number>`1` }).from(licencas).where(eq(licencas.usinaId, id)).limit(1);
      const [temM] = await tx.select({ existe: sql<number>`1` }).from(manutencoes).where(eq(manutencoes.usinaId, id)).limit(1);
      if (tem || temM) return erro('Exclua antes as licenças e manutenções desta usina (ou apenas inative-a)', 409);
      await tx.delete(usinas).where(eq(usinas.id, id));
      await registrar(tx, sessao.nome, `Excluiu a usina ${atual.nome}`);
      return NextResponse.json({ ok: true });
    });
  } catch (e) {
    if (codigoPostgres(e) === '23503') return erro('Exclua antes as licenças e manutenções desta usina (ou apenas inative-a)', 409);
    throw e;
  }
}
