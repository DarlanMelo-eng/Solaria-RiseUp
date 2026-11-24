import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { criarToken, lerSessao, validarSegredo } from '@/lib/sessao';

const segredoOriginal = process.env.SESSION_SECRET;
const s = { sub: '00000000-0000-4000-8000-000000000001', v: 3, email: 'teste@example.com', nome: 'Teste', papel: 'gestor' as const };
beforeAll(() => { process.env.SESSION_SECRET = randomBytes(32).toString('base64'); });
afterAll(() => { process.env.SESSION_SECRET = segredoOriginal; vi.useRealTimers(); });

describe('cookie HMAC', () => {
  it('exige segredo forte', () => {
    process.env.SESSION_SECRET = 'fraco';
    expect(validarSegredo).toThrow('SESSION_SECRET');
    process.env.SESSION_SECRET = randomBytes(32).toString('base64');
  });
  it('assina, lê e detecta adulteração', async () => {
    const token = await criarToken(s);
    expect(await lerSessao(token)).toEqual(s);
    const [payload, assinatura] = token.split('.');
    expect(await lerSessao(`${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}.${assinatura}`)).toBeNull();
    expect(await lerSessao(`${payload}.${assinatura.slice(1)}A`)).toBeNull();
  });
  it('expira após oito horas', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    const token = await criarToken(s);
    vi.advanceTimersByTime(8 * 60 * 60 * 1000 + 1_000);
    expect(await lerSessao(token)).toBeNull();
    vi.useRealTimers();
  });
});
