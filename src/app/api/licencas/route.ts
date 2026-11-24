import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { licencaSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { licencas, usinas } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { codigoPostgres } from '@/lib/db/erros';
import { formatarLicenca } from '@/lib/db/formatar';
import { erro, exigir, falhou, idValido, lerCorpo } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const usinaId = req.nextUrl.searchParams.get('usinaId');
  if (usinaId && !idValido(usinaId)) return erro('Identificador de usina inválido', 400);
  return NextResponse.json((await banco.select().from(licencas).where(usinaId ? eq(licencas.usinaId, usinaId) : undefined)).map(formatarLicenca));
}
export async function POST(req: NextRequest) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, licencaSchema);
  if (!corpo.ok) return corpo.resposta;
  const d = corpo.dados;
  try {
    return await banco.transaction(async (tx) => {
      const [usina] = await tx.select().from(usinas).where(eq(usinas.id, d.usinaId)).for('update');
      if (!usina) return erro('Usina não encontrada', 404);
      if (usina.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
      const [l] = await tx.insert(licencas).values({ ...d, observacao: d.observacao || null }).returning();
      await registrar(tx, sessao.nome, `Cadastrou ${l.tipo} (${l.numero}) em ${usina.nome}`);
      return NextResponse.json(formatarLicenca(l), { status: 201 });
    });
  } catch (e) {
    if (codigoPostgres(e) === '23505') return erro('Essa licença já está cadastrada nesta usina', 409, { numero: 'Número já cadastrado para este tipo' });
    throw e;
  }
}
