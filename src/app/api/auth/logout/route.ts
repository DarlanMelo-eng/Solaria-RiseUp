import { NextResponse, type NextRequest } from 'next/server';
import { protegerOrigem } from '@/lib/http';
import { COOKIE_SESSAO } from '@/lib/sessao';
export const runtime = 'nodejs';

/**
 * Encerra a sessão apagando o cookie.
 *
 * Não exige sessão válida: sair é sempre permitido, inclusive com a sessão já revogada
 * (senha trocada, conta desativada). Antes, nesses casos a rota respondia 401 e o cookie ficava.
 * Também não consulta o banco: o logout funciona mesmo com o PostgreSQL fora do ar.
 *
 * Continua protegido contra outras origens (CSRF): um site externo não consegue deslogar ninguém.
 */
export async function POST(req: NextRequest) {
  const csrf = protegerOrigem(req);
  if (csrf) return csrf;
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  // Mesmos atributos do cookie criado no login; com outros atributos o navegador não o apagaria.
  res.cookies.set(COOKIE_SESSAO, '', {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0,
  });
  return res;
}
