import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// Durante o `next build` o Next só importa os módulos para analisá-los: nenhuma consulta roda.
// O Pool não abre conexão até a primeira consulta, então o build não precisa do banco nem de segredos.
const emBuild = process.env.NEXT_PHASE === 'phase-production-build';

function configuracao() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !emBuild) throw new Error('DATABASE_URL ausente. Configure o PostgreSQL no arquivo .env.');
  if (process.env.NODE_ENV === 'production' && !emBuild && process.env.DATABASE_SSL !== 'true') {
    throw new Error('Produção exige DATABASE_SSL=true e certificado TLS válido para PostgreSQL.');
  }
  const ssl = process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA && { ca: process.env.DATABASE_SSL_CA }) }
    : undefined;
  return { connectionString, ssl, max: 10, idleTimeoutMillis: 30_000 };
}

const globalPool = globalThis as typeof globalThis & { __solariaPool?: Pool };
export const pool = globalPool.__solariaPool ?? new Pool(configuracao());
if (process.env.NODE_ENV !== 'production') globalPool.__solariaPool = pool;
export const banco = drizzle(pool, { schema });
export type Transacao = Parameters<Parameters<typeof banco.transaction>[0]>[0];
