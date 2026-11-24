import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, lerSessao } from '@/lib/sessao';

const PUBLICAS = new Set(['/', '/login', '/esqueci-senha', '/redefinir-senha',
  '/api/auth/login', '/api/auth/esqueci-senha', '/api/auth/redefinir-senha']);

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const ehApi = pathname.startsWith('/api/');
  // Nonce por resposta: Next.js o encontra na requisição para scripts de hidratação.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self' data:", "connect-src 'self'", "form-action 'self'", "upgrade-insecure-requests",
  ].filter((item) => process.env.NODE_ENV === 'production' || item !== 'upgrade-insecure-requests').join('; ');
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const continuar = () => {
    const resposta = NextResponse.next({ request: { headers: requestHeaders } });
    resposta.headers.set('Content-Security-Policy', csp);
    return resposta;
  };
  if (PUBLICAS.has(pathname) && pathname !== '/login') return continuar();
  const sessao = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  if (!sessao) {
    if (ehApi) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401, headers: { 'Cache-Control': 'no-store', 'Content-Security-Policy': csp } });
    if (pathname === '/login') return continuar();
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    const resposta = NextResponse.redirect(url);
    resposta.headers.set('Content-Security-Policy', csp);
    return resposta;
  }
  if (pathname === '/login' || pathname === '/esqueci-senha') return NextResponse.redirect(new URL('/dashboard', req.url));
  return continuar();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
