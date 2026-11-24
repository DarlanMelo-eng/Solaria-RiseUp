import { NextResponse, type NextRequest } from 'next/server';
import { usinaSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { usinas } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { codigoPostgres } from '@/lib/db/erros';
import { formatarUsina } from '@/lib/db/formatar';
import { erro, exigir, falhou, lerCorpo } from '@/lib/http';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  return NextResponse.json((await banco.select().from(usinas)).map(formatarUsina));
}
export async function POST(req: NextRequest) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, usinaSchema);
  if (!corpo.ok) return corpo.resposta;
  try {
    const novo = await banco.transaction(async (tx) => {
      const [u] = await tx.insert(usinas).values(corpo.dados).returning();
      await registrar(tx, sessao.nome, `Cadastrou a usina ${u.nome}`);
      return u;
    });
    return NextResponse.json(formatarUsina(novo), { status: 201 });
  } catch (e) {
    if (codigoPostgres(e) === '23505') return erro('Já existe uma usina com esse nome', 409, { nome: 'Nome já utilizado' });
    throw e;
  }
}
