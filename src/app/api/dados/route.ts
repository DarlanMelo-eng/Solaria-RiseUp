import { NextResponse, type NextRequest } from 'next/server';
import { buscarDados } from '@/lib/consultas';
import { exigir, falhou } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Usinas, licenças e manutenções numa única chamada e com uma única conferência de sessão.
 * As rotas individuais continuam existindo para integrações.
 */
export async function GET(req: NextRequest) {
  const inicio = performance.now();
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const fimAutenticacao = performance.now();
  const dados = await buscarDados();
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (process.env.NODE_ENV !== 'production') {
    const banco = performance.now() - fimAutenticacao;
    headers['Server-Timing'] = `sessao;dur=${(fimAutenticacao - inicio).toFixed(1)}, consultas;dur=${banco.toFixed(1)}`;
  }
  return NextResponse.json(dados, { headers });
}
