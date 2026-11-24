import { NextResponse, type NextRequest } from 'next/server';
import { desc } from 'drizzle-orm';
import { banco } from '@/lib/db';
import { atividades } from '@/lib/db/schema';
import { formatarAtividade } from '@/lib/db/formatar';
import { exigir, falhou } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  return NextResponse.json((await banco.select().from(atividades).orderBy(desc(atividades.em)).limit(20)).map(formatarAtividade));
}
