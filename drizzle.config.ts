import { defineConfig } from 'drizzle-kit';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL ?? '';

/*
 * Trava de segurança (Lote 8): `migrate` e `push` alteram o banco. Fora do banco de testes, eles só
 * rodam se a pessoa confirmar que fez o backup, repetindo o nome do banco:
 *   CONFIRMO_BACKUP=<nome do banco> npm run db:migrate
 * `generate` não se conecta ao banco e não é afetado.
 */
const BANCO_DE_TESTES = 'solaria_test';
const comandoQueAltera = process.argv.slice(2).find((arg) => arg === 'migrate' || arg === 'push');
if (comandoQueAltera) {
  let nomeDoBanco = '';
  try {
    nomeDoBanco = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`[trava] DATABASE_URL inválida: "drizzle-kit ${comandoQueAltera}" foi cancelado.`);
  }
  if (!nomeDoBanco) throw new Error(`[trava] DATABASE_URL sem nome de banco: "drizzle-kit ${comandoQueAltera}" foi cancelado.`);
  if (nomeDoBanco !== BANCO_DE_TESTES && process.env.CONFIRMO_BACKUP !== nomeDoBanco) {
    throw new Error(`[trava] "drizzle-kit ${comandoQueAltera}" vai alterar o banco "${nomeDoBanco}". ` +
      `Faça o backup (pg_dump) e repita com CONFIRMO_BACKUP=${nomeDoBanco}.`);
  }
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
});
