import { describe, expect, it } from 'vitest';
import { alterarSenhaSchema } from '@/schemas/autenticacao';

describe('política de alteração autenticada de senha', () => {
  it('exige a senha atual', () => {
    const r = alterarSenhaSchema.safeParse({ senhaAtual: '', novaSenha: 'Nova#senhaSegura123', confirmacao: 'Nova#senhaSegura123' });
    expect(r.success).toBe(false);
  });
  it('recusa confirmação diferente e senha repetida', () => {
    const base = { senhaAtual: 'SenhaAnteriorSegura123', novaSenha: 'SenhaAnteriorSegura123' };
    expect(alterarSenhaSchema.safeParse({ ...base, confirmacao: base.novaSenha }).success).toBe(false);
    expect(alterarSenhaSchema.safeParse({ ...base, novaSenha: 'Nova#senhaSegura123', confirmacao: 'Outra#senhaSegura123' }).success).toBe(false);
  });
  it('aceita senha nova longa, sem obrigar caracteres especiais', () => {
    expect(alterarSenhaSchema.safeParse({ senhaAtual: 'SenhaAnteriorSegura123', novaSenha: 'NovaSenhaSeguraLonga', confirmacao: 'NovaSenhaSeguraLonga' }).success).toBe(true);
  });
});
