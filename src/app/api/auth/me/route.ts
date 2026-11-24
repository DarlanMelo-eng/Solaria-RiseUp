import { NextResponse, type NextRequest } from 'next/server';
import { exigir, falhou } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const s = await exigir(req);
  return falhou(s) ? s : NextResponse.json({ email: s.email, nome: s.nome, papel: s.papel });
}
