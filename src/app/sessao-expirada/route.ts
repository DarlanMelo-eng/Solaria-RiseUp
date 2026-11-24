import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, lerSessao } from '@/lib/sessao';
import { verificarUsuarioSessao } from '@/lib/usuarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Para onde o layout manda quem tem um cookie com assinatura válida, mas que o banco recusou
 * (senha trocada em outro aparelho, conta desativada pelo admin).
 *
 * Por que existe: o proxy só confere a assinatura e mandaria /login de volta para /dashboard,
 * e o layout mandaria /dashboard de volta para /login, sem parar. Aqui o cookie é apagado
 * antes de ir ao login, e o ciclo termina.
 *
 * Regras de segurança:
 * - Só apaga quando a sessão já é inválida. Com sessão válida, vai para o dashboard e não mexe em nada:
 *   um link malicioso para esta rota não consegue deslogar ninguém.
 * - Se o banco falhar, o erro sobe (página "Algo deu errado"): uma queda temporária do PostgreSQL
 *   não pode apagar uma sessão que talvez continue válida.
 * - Destinos fixos: parâmetros como ?next= são ignorados, então não há redirecionamento externo.
 */
export async function GET(req: NextRequest) {
  const lida = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  const valida = lida !== null && (await verificarUsuarioSessao(lida)) !== null;

  const destino = req.nextUrl.clone();
  destino.pathname = valida ? '/dashboard' : '/login';
  destino.search = '';
  const resposta = NextResponse.redirect(destino);
  resposta.headers.set('Cache-Control', 'no-store');

  if (!valida && req.cookies.has(COOKIE_SESSAO)) {
    // Mesmos atributos do cookie criado no login; com outros atributos o navegador não o apagaria.
    resposta.cookies.set(COOKIE_SESSAO, '', {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0,
    });
  }
  return resposta;
}
