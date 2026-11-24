import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { manutencaoSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { manutencoes, usinas } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { formatarManutencao } from '@/lib/db/formatar';
import { erro, exigir, falhou, idValido, lerCorpo } from '@/lib/http';
import { hojeServidor } from '@/lib/fuso';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const usinaId = req.nextUrl.searchParams.get('usinaId');
  if (usinaId && !idValido(usinaId)) return erro('Identificador de usina inválido', 400);
  return NextResponse.json((await banco.select().from(manutencoes).where(usinaId ? eq(manutencoes.usinaId, usinaId) : undefined)).map(formatarManutencao));
}
export async function POST(req: NextRequest) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, manutencaoSchema);
  if (!corpo.ok) return corpo.resposta;
  const d = corpo.dados;
  return banco.transaction(async (tx) => {
    const [u] = await tx.select().from(usinas).where(eq(usinas.id, d.usinaId)).for('update');
    if (!u) return erro('Usina não encontrada', 404);
    if (u.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
    const [m] = await tx.insert(manutencoes).values({ ...d, concluidaEm: d.status === 'concluida' ? hojeServidor() : null }).returning();
    await registrar(tx, sessao.nome, `Agendou "${m.titulo}" em ${u.nome}`);
    return NextResponse.json(formatarManutencao(m), { status: 201 });
  });
}
