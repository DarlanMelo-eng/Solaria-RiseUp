import { z } from 'zod';

const senhasComuns = new Set([
  'password123', '1234567890', '12345678910', 'qwerty12345',
  'admin123456', 'senha123456', 'password1234', '123456789123',
]);
export const emailSchema = z.email('E-mail inválido').max(254, 'E-mail muito longo').transform((e) => e.trim().toLowerCase());
export const senhaSchema = z.string().min(10, 'Use pelo menos 10 caracteres')
  .max(128, 'Use no máximo 128 caracteres')
  .refine((s) => !senhasComuns.has(s.toLowerCase()), 'Escolha uma senha menos comum');
export const esqueciSenhaSchema = z.object({ email: z.string().trim().pipe(emailSchema) });
export const redefinirSenhaSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Link inválido'),
  senha: senhaSchema,
  confirmacao: z.string(),
}).superRefine((d, ctx) => {
  if (d.senha !== d.confirmacao) ctx.addIssue({ code: 'custom', path: ['confirmacao'], message: 'As senhas não coincidem' });
});
export const criarUsuarioSchema = z.object({
  email: z.string().trim().pipe(emailSchema),
  nome: z.string().trim().min(2).max(120),
  papel: z.enum(['admin', 'gestor', 'consulta']),
});
export const atualizarUsuarioSchema = z.object({
  id: z.uuid(),
  papel: z.enum(['admin', 'gestor', 'consulta']).optional(),
  ativo: z.boolean().optional(),
}).refine((d) => d.ativo !== undefined || d.papel !== undefined, 'Informe ao menos uma alteração');
export function senhaIgualEmail(senha: string, email: string) {
  return senha.trim().toLowerCase() === email.trim().toLowerCase();
}


/** Alteração autenticada: exige senha atual e invalida todas as sessões. */
export const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe sua senha atual').max(128),
  novaSenha: senhaSchema,
  confirmacao: z.string(),
}).superRefine((d, ctx) => {
  if (d.novaSenha !== d.confirmacao) ctx.addIssue({ code: 'custom', path: ['confirmacao'], message: 'As senhas não coincidem' });
  if (d.novaSenha === d.senhaAtual) ctx.addIssue({ code: 'custom', path: ['novaSenha'], message: 'Escolha uma senha diferente da atual' });
});
