import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { manutencaoSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { manutencoes, usinas } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { formatarManutencao } from '@/lib/db/formatar';
import { erro, exigir, falhou, idValido, lerCorpo, type Contexto } from '@/lib/http';
import { hojeServidor } from '@/lib/fuso';
export const runtime = 'nodejs';
const parcial = manutencaoSchema.omit({ usinaId: true }).partial();
const ROTULO = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' } as const;

export async function PATCH(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const corpo = await lerCorpo(req, parcial);
  if (!corpo.ok) return corpo.resposta;
  return banco.transaction(async (tx) => {
    const [m] = await tx.select().from(manutencoes).where(eq(manutencoes.id, id)).for('update');
    if (!m) return erro('Manutenção não encontrada', 404);
    const [u] = await tx.select().from(usinas).where(eq(usinas.id, m.usinaId)).for('update');
    if (u?.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
    const status = corpo.dados.status ?? m.status;
    const concluidaEm = status === 'concluida' ? (m.status === 'concluida' ? m.concluidaEm : hojeServidor()) : null;
    const [novo] = await tx.update(manutencoes).set({ ...corpo.dados, concluidaEm }).where(eq(manutencoes.id, id)).returning();
    await registrar(tx, sessao.nome, m.status !== novo.status
      ? `Moveu "${novo.titulo}" para ${ROTULO[novo.status]} (${u?.nome ?? 'usina'})`
      : `Editou "${novo.titulo}" (${u?.nome ?? 'usina'})`);
    return NextResponse.json(formatarManutencao(novo));
  });
}
export async function DELETE(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'excluir');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  return banco.transaction(async (tx) => {
    const [m] = await tx.select().from(manutencoes).where(eq(manutencoes.id, id)).for('update');
    if (!m) return erro('Manutenção não encontrada', 404);
    const [u] = await tx.select().from(usinas).where(eq(usinas.id, m.usinaId)).for('update');
    if (u?.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
    await tx.delete(manutencoes).where(eq(manutencoes.id, id));
    await registrar(tx, sessao.nome, `Excluiu "${m.titulo}" de ${u?.nome ?? 'usina'}`);
    return NextResponse.json({ ok: true });
  });
}
