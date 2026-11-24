import type { NextRequest } from 'next/server';
import { isIP } from 'node:net';

/** Valor devolvido quando não há IP confiável. Não identifica ninguém: nunca use como chave de bloqueio. */
export const IP_DESCONHECIDO = 'desconhecido';

/** Não confiar em IP enviado pelo próprio cliente. O proxy confiável DEVE substituir o cabeçalho. */
export function obterIp(req: NextRequest) {
  if (process.env.TRUST_PROXY !== 'true') return IP_DESCONHECIDO;
  const enderecos = req.headers.get('x-forwarded-for')?.split(',');
  const ip = enderecos?.at(-1)?.trim() ?? '';
  return isIP(ip) ? ip : IP_DESCONHECIDO;
}
