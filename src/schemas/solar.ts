import { z } from 'zod';

const dataISO = z.iso.date({ error: 'Informe uma data válida' });

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail').pipe(z.email('E-mail inválido').max(254, 'E-mail muito longo')),
  senha: z.string().min(1, 'Informe a senha'),
});

export const usinaSchema = z.object({
  nome: z.string().trim().min(3, 'Mínimo de 3 caracteres').max(80, 'Máximo de 80 caracteres'),
  localizacao: z
    .string()
    .trim()
    .max(180, 'Localização muito longa')
    .regex(/^.{2,}, ?[A-Za-z]{2}$/, 'Use o formato Cidade, UF (ex.: Petrolina, PE)'),
  capacidadeKwp: z
    .number({ error: 'Informe a capacidade' })
    .positive('Deve ser maior que zero')
    .max(1_000_000, 'Valor acima do limite'),
  status: z.enum(['ativa', 'inativa']),
});

export const licencaSchema = z.object({
  usinaId: z.uuid('Identificador de usina inválido'),
  tipo: z.string().trim().min(3, 'Informe o tipo').max(80),
  emissor: z.string().trim().min(2, 'Informe o órgão emissor').max(80),
  numero: z.string().trim().min(2, 'Informe o número').max(40),
  dataValidade: dataISO,
  observacao: z.string().trim().max(300, 'Máximo de 300 caracteres').optional(),
});

export const manutencaoSchema = z.object({
  usinaId: z.uuid('Identificador de usina inválido'),
  titulo: z.string().trim().min(3, 'Informe o título').max(100),
  responsavel: z.string().trim().min(2, 'Informe o responsável').max(80),
  prazo: dataISO,
  prioridade: z.enum(['baixa', 'media', 'alta']),
  status: z.enum(['pendente', 'em_andamento', 'concluida']),
});

const camposCondicionante = {
  codigo: z.string().trim().min(1, 'Informe o código').max(20, 'Máximo de 20 caracteres'),
  descricao: z.string().trim().min(3, 'Descreva a condicionante').max(500, 'Máximo de 500 caracteres'),
  categoria: z.enum(['monitoramento', 'relatorio', 'compensacao', 'operacional', 'outro'], { error: 'Categoria inválida' }),
  responsavel: z.string().trim().min(2, 'Informe o responsável').max(80, 'Máximo de 80 caracteres'),
  periodicidade: z.enum(['unica', 'mensal', 'trimestral', 'semestral', 'anual'], { error: 'Periodicidade inválida' }),
  prazo: dataISO,
  observacao: z.string().trim().max(300, 'Máximo de 300 caracteres').optional(),
};
const MSG_CUMPRIDA = 'Para marcar como cumprida, registre o cumprimento da condicionante';

/** Cadastro. O prazo informado vira a âncora do calendário; ciclo e calendário são do servidor. */
export const condicionanteSchema = z.object({
  licencaId: z.uuid('Identificador de licença inválido'),
  ...camposCondicionante,
  status: z.enum(['pendente', 'em_andamento'], { error: 'Uma condicionante nova começa pendente ou em andamento' }).optional(),
});

/**
 * Edição parcial. A licença não muda, e "cumprida" não é aceita: só o registro de cumprimento
 * (Lote 10) pode cumprir. Campos desconhecidos (ciclo, calendário...) são descartados pelo Zod,
 * então um corpo só com eles também conta como vazio.
 */
export const condicionanteEdicaoSchema = z.object({
  ...camposCondicionante,
  status: z.enum(['pendente', 'em_andamento', 'encerrada'], { error: MSG_CUMPRIDA }),
}).partial().refine((d) => Object.values(d).some((v) => v !== undefined), { error: 'Envie ao menos um campo para alterar' });

/**
 * Registro de cumprimento. `prazoReferencia` é o vencimento que a pessoa viu na tela: se ele já
 * não for o atual (outra pessoa cumpriu antes, ou o prazo mudou), a API responde 409.
 */
export const cumprimentoSchema = z.object({
  prazoReferencia: dataISO,
  cumpridaEm: dataISO.optional(),
  observacao: z.string().trim().max(300, 'Máximo de 300 caracteres').optional(),
});

/** Desfazer = cancelar o último cumprimento, com motivo. O registro nunca é apagado. */
export const cancelamentoCumprimentoSchema = z.object({
  cumprimentoId: z.uuid('Identificador de cumprimento inválido'),
  motivo: z.string().trim().min(5, 'Explique o motivo do cancelamento').max(300, 'Máximo de 300 caracteres'),
});

export type CondicionanteDados = z.infer<typeof condicionanteSchema>;
export type CondicionanteEdicao = z.infer<typeof condicionanteEdicaoSchema>;
export type CumprimentoDados = z.infer<typeof cumprimentoSchema>;
export type CancelamentoCumprimentoDados = z.infer<typeof cancelamentoCumprimentoSchema>;
export type LoginDados = z.infer<typeof loginSchema>;
export type UsinaDados = z.infer<typeof usinaSchema>;
export type LicencaDados = z.infer<typeof licencaSchema>;
export type ManutencaoDados = z.infer<typeof manutencaoSchema>;

export const TIPOS_LICENCA = [
  'Parecer de Acesso',
  'Licença de Operação Ambiental',
  'Outorga ANEEL',
  'Licença de Instalação',
  'Alvará de Funcionamento',
];
