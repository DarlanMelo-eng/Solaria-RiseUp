import { NextResponse, type NextRequest } from 'next/server';
import type { ZodType, z } from 'zod';
import type { SessaoToken } from './sessao';
import { COOKIE_SESSAO, lerSessao } from './sessao';
import { verificarUsuarioSessao } from './usuarios';
import { pode, type Permissao } from './permissoes';

export const erro = (mensagem: string, status = 400, detalhes?: Record<string, string>) =>
  NextResponse.json({ erro: mensagem, detalhes }, { status, headers: { 'Cache-Control': 'no-store' } });

export function protegerOrigem(req: NextRequest): NextResponse | null {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return null;
  const url = process.env.APP_URL;
  if (!url) throw new Error('APP_URL ausente. Configure a origem canônica do aplicativo.');
  const origem = req.headers.get('origin');
  if (origem) {
    try {
      if (new URL(origem).origin !== new URL(url).origin) return erro('Origem não autorizada', 403);
    } catch { return erro('Origem não autorizada', 403); }
  } else {
    // Sem Origin, só aceitar fetch da mesma origem ou JSON: impede envio por forms simples cross-site.
    const local = req.headers.get('sec-fetch-site') === 'same-origin';
    if (!local && !req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return erro('Origem não autorizada', 403);
    }
  }
  if (req.headers.get('sec-fetch-site') === 'cross-site') return erro('Origem não autorizada', 403);
  return null;
}

export async function exigir(req: NextRequest, permissao?: Permissao): Promise<SessaoToken | NextResponse> {
  const csrf = protegerOrigem(req);
  if (csrf) return csrf;
  const sessao = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  if (!sessao) return erro('Não autenticado', 401);
  const usuario = await verificarUsuarioSessao(sessao);
  if (!usuario) return erro('Não autenticado', 401);
  if (permissao && !pode(usuario.papel, permissao)) return erro('Seu perfil não tem permissão para esta ação', 403);
  return usuario;
}

type Corpo<T> = { ok: true; dados: T } | { ok: false; resposta: NextResponse };
export async function lerCorpo<S extends ZodType>(req: NextRequest, schema: S): Promise<Corpo<z.output<S>>> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { ok: false, resposta: erro('Envie o corpo como application/json', 415) };
  }
  let bruto: unknown;
  try { bruto = await req.json(); } catch { return { ok: false, resposta: erro('JSON inválido', 400) }; }
  const r = schema.safeParse(bruto);
  if (r.success) return { ok: true, dados: r.data };
  const detalhes: Record<string, string> = {};
  for (const i of r.error.issues) detalhes[String(i.path[0] ?? 'corpo')] ??= i.message;
  return { ok: false, resposta: erro('Dados inválidos', 422, detalhes) };
}
export const falhou = (s: SessaoToken | NextResponse): s is NextResponse => s instanceof NextResponse;
export type Contexto = { params: Promise<{ id: string }> };
export const idValido = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
