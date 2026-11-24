import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { licencaSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { licencas, usinas } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { bloqueadoPorRelacionamento, codigoPostgres } from '@/lib/db/erros';
import { formatarLicenca } from '@/lib/db/formatar';
import { erro, exigir, falhou, idValido, lerCorpo, type Contexto } from '@/lib/http';
export const runtime = 'nodejs';
const parcial = licencaSchema.omit({ usinaId: true }).partial();

export async function PATCH(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const corpo = await lerCorpo(req, parcial);
  if (!corpo.ok) return corpo.resposta;
  try {
    return await banco.transaction(async (tx) => {
      const [l] = await tx.select().from(licencas).where(eq(licencas.id, id)).for('update');
      if (!l) return erro('Licença não encontrada', 404);
      const [u] = await tx.select().from(usinas).where(eq(usinas.id, l.usinaId)).for('update');
      if (u?.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
      const [novo] = await tx.update(licencas).set({ ...corpo.dados, ...(corpo.dados.observacao !== undefined && { observacao: corpo.dados.observacao || null }) }).where(eq(licencas.id, id)).returning();
      await registrar(tx, sessao.nome, `Editou ${novo.tipo} (${novo.numero}) em ${u?.nome ?? 'usina'}`);
      return NextResponse.json(formatarLicenca(novo));
    });
  } catch (e) {
    if (codigoPostgres(e) === '23505') return erro('Essa licença já está cadastrada nesta usina', 409, { numero: 'Número já cadastrado para este tipo' });
    throw e;
  }
}
export async function DELETE(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'excluir');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  try {
    return await banco.transaction(async (tx) => {
      const [l] = await tx.select().from(licencas).where(eq(licencas.id, id)).for('update');
      if (!l) return erro('Licença não encontrada', 404);
      const [u] = await tx.select().from(usinas).where(eq(usinas.id, l.usinaId)).for('update');
      if (u?.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
      await tx.delete(licencas).where(eq(licencas.id, id));
      await registrar(tx, sessao.nome, `Excluiu ${l.tipo} (${l.numero}) de ${u?.nome ?? 'usina'}`);
      return NextResponse.json({ ok: true });
    });
  } catch (e) {
    // Condicionantes ligadas à licença (FK RESTRICT): 23503 até o PostgreSQL 17, 23001 a partir do 18.
    if (bloqueadoPorRelacionamento(e)) return erro('Exclua antes as condicionantes desta licença', 409);
    throw e;
  }
}
