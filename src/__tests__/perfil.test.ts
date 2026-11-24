import { describe, expect, it } from 'vitest';
import { atualizarPerfilSchema } from '@/schemas/perfil';

describe('preferências e edição de perfil', () => {
  it('aceita nome, tema e preferências válidas', () => {
    const p = atualizarPerfilSchema.parse({ nome: '  Ana Silva  ', tema: 'escuro', menuModo: 'recolhido', menuFixado: false, avatarCor: 'verde' });
    expect(p.nome).toBe('Ana Silva');
    expect(p.menuFixado).toBe(false);
  });
  it('rejeita nome vazio, cores inválidas e campos inesperados', () => {
    expect(atualizarPerfilSchema.safeParse({ nome: ' ' }).success).toBe(false);
    expect(atualizarPerfilSchema.safeParse({ avatarCor: 'url-external' }).success).toBe(false);
    expect(atualizarPerfilSchema.safeParse({ papel: 'admin' }).success).toBe(false);
    expect(atualizarPerfilSchema.safeParse({}).success).toBe(false);
  });
});
