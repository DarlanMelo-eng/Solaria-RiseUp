import { defineConfig } from 'vitest/config';
import { loadEnvConfig } from '@next/env';
import path from 'node:path';

// Em modo de teste o Next.js lê .env, .env.test e .env.test.local, mas NÃO o .env.local.
// Coloque TEST_DATABASE_URL no .env para ativar os testes de integração.
loadEnvConfig(process.cwd());
if (!process.env.TEST_DATABASE_URL) {
  console.warn('\n[aviso] TEST_DATABASE_URL não definida: os testes de integração com PostgreSQL serão PULADOS.\n' +
    '        Defina-a no arquivo .env (veja .env.example).\n');
}

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
