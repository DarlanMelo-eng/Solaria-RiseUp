import type { Papel, Sessao } from '@/types/solar';

// Exclusivamente Web Crypto: importável pelo proxy sem APIs Node.
export const COOKIE_SESSAO = 'solaria_session';
export const DURACAO_SESSAO_SEG = 60 * 60 * 8;
export type SessaoToken = Sessao & { sub: string; v: number };
const PAPEIS: readonly Papel[] = ['admin', 'gestor', 'consulta'];
const encoder = new TextEncoder();

export function validarSegredo(): string {
  const valor = process.env.SESSION_SECRET;
  if (!valor || valor.length < 32) {
    throw new Error('SESSION_SECRET obrigatório, com no mínimo 32 caracteres. Gere com: openssl rand -base64 32');
  }
  return valor;
}
const chave = () => crypto.subtle.importKey('raw', encoder.encode(validarSegredo()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const paraB64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) throw new Error('Codificação inválida');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Cookie firmado com HMAC-SHA256. O banco confere sub e v para revogação. */
export async function criarToken(sessao: SessaoToken): Promise<string> {
  const payload = paraB64u(encoder.encode(JSON.stringify({ ...sessao, exp: Math.floor(Date.now() / 1000) + DURACAO_SESSAO_SEG })));
  const assinatura = await crypto.subtle.sign('HMAC', await chave(), encoder.encode(payload));
  return `${payload}.${paraB64u(assinatura)}`;
}

export async function lerSessao(token?: string): Promise<SessaoToken | null> {
  const k = await chave(); // Falha de configuração não pode ser escondida como sessão inválida.
  if (!token || token.length > 4000) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payload, assinatura] = partes;
  try {
    const assinaturaBytes = deB64u(assinatura);
    if (assinaturaBytes.length !== 32) return null;
    const ok = await crypto.subtle.verify('HMAC', k, assinaturaBytes, encoder.encode(payload));
    if (!ok) return null;
    const d: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(deB64u(payload)));
    if (!d || typeof d !== 'object') return null;
    const v = d as Record<string, unknown>;
    if (typeof v.exp !== 'number' || !Number.isFinite(v.exp) || v.exp <= Date.now() / 1000) return null;
    if (typeof v.sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.sub) ||
        typeof v.v !== 'number' || !Number.isSafeInteger(v.v) || v.v < 0 ||
        typeof v.email !== 'string' || typeof v.nome !== 'string' ||
        !PAPEIS.includes(v.papel as Papel)) return null;
    return { sub: v.sub, v: v.v, email: v.email, nome: v.nome, papel: v.papel as Papel };
  } catch {
    return null;
  }
}
