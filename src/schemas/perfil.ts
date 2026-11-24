import { z } from 'zod';

export const temaSchema = z.enum(['claro', 'escuro', 'sistema']);
export const menuModoSchema = z.enum(['expandido', 'recolhido']);
export const corAvatarSchema = z.enum(['ambar', 'azul', 'verde', 'violeta', 'rosa']);

export const atualizarPerfilSchema = z.object({
  nome: z.string().trim().min(2, 'Informe pelo menos 2 caracteres').max(120, 'Nome muito longo').optional(),
  tema: temaSchema.optional(),
  menuModo: menuModoSchema.optional(),
  menuFixado: z.boolean().optional(),
  avatarCor: corAvatarSchema.optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Informe ao menos uma alteração');

export type AtualizarPerfil = z.infer<typeof atualizarPerfilSchema>;
export type Tema = z.infer<typeof temaSchema>;
export type MenuModo = z.infer<typeof menuModoSchema>;
export type CorAvatar = z.infer<typeof corAvatarSchema>;

export type Perfil = {
  email: string;
  nome: string;
  papel: 'admin' | 'gestor' | 'consulta';
  tema: Tema;
  menuModo: MenuModo;
  menuFixado: boolean;
  avatarCor: CorAvatar;
};

export const PERFIL_PADRAO = {
  tema: 'sistema', menuModo: 'expandido', menuFixado: true, avatarCor: 'ambar',
} as const;
