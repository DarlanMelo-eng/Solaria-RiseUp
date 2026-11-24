import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_SERVER } from 'next/constants';

/**
 * Confere as variáveis obrigatórias só quando o servidor de produção sobe (`npm start`).
 * O `npm run build` não precisa de segredos: assim o build roda no CI e em qualquer máquina.
 */
function validarProducao() {
  const faltando: string[] = [];
  if ((process.env.SESSION_SECRET ?? '').length < 32) faltando.push('SESSION_SECRET (mínimo 32 caracteres)');
  if (!process.env.DATABASE_URL) faltando.push('DATABASE_URL');
  if (process.env.DATABASE_SSL !== 'true') faltando.push('DATABASE_SSL=true');
  if (!process.env.APP_URL?.startsWith('https://')) faltando.push('APP_URL com https://');
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) faltando.push('SMTP_HOST e SMTP_FROM');
  if (faltando.length) throw new Error(`Produção sem configuração obrigatória: ${faltando.join(', ')}.`);
}

const cabecalhosSeguranca = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

export default function configuracao(fase: string): NextConfig {
  if (fase === PHASE_PRODUCTION_SERVER) validarProducao();
  return {
    poweredByHeader: false,
    reactStrictMode: true,
    async headers() {
      return [
        { source: '/:path*', headers: cabecalhosSeguranca },
        { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
        {
          source: '/redefinir-senha',
          headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'no-store' }],
        },
      ];
    },
  };
}
