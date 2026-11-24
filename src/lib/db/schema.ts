import { sql } from 'drizzle-orm';
import {
  boolean, char, check, customType, date, doublePrecision, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';

/*
 * Os nomes das restrições (fkey, key, check) espelham exatamente o banco criado pelas migrações 0000 e 0001.
 * Assim o `npm run db:generate` compara o schema com o banco real e só gera o que de fato mudou.
 */

export const papelEnum = pgEnum('papel_usuario', ['admin', 'gestor', 'consulta']);
export const statusUsinaEnum = pgEnum('status_usina', ['ativa', 'inativa']);
export const prioridadeEnum = pgEnum('prioridade_manutencao', ['baixa', 'media', 'alta']);
export const statusManutencaoEnum = pgEnum('status_manutencao', ['pendente', 'em_andamento', 'concluida']);

export const usuarios = pgTable('usuarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 254 }).notNull(),
  nome: varchar('nome', { length: 120 }).notNull(),
  papel: papelEnum('papel').notNull(),
  senhaHash: text('senha_hash').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  versaoToken: integer('versao_token').notNull().default(0),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('usuarios_email_key').on(t.email),
  uniqueIndex('usuarios_email_lower_unico').on(sql`lower(${t.email})`),
  check('usuarios_email_minusculo', sql`${t.email} = lower(${t.email})`),
]);

export const resetTokens = pgTable('reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id').notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  usadoEm: timestamp('usado_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  ip: varchar('ip', { length: 64 }),
}, (t) => [
  foreignKey({ name: 'reset_tokens_usuario_id_fkey', columns: [t.usuarioId], foreignColumns: [usuarios.id] }).onDelete('cascade'),
  unique('reset_tokens_token_hash_key').on(t.tokenHash),
  index('reset_tokens_usuario_abertos_idx').on(t.usuarioId, t.expiraEm),
]);

export const usinas = pgTable('usinas', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: varchar('nome', { length: 80 }).notNull(),
  localizacao: varchar('localizacao', { length: 180 }).notNull(),
  capacidadeKwp: doublePrecision('capacidade_kwp').notNull(),
  status: statusUsinaEnum('status').notNull(),
}, (t) => [
  uniqueIndex('usinas_nome_lower_unico').on(sql`lower(${t.nome})`),
  check('usinas_capacidade_kwp_check', sql`${t.capacidadeKwp} > 0`),
]);

export const licencas = pgTable('licencas', {
  id: uuid('id').defaultRandom().primaryKey(),
  usinaId: uuid('usina_id').notNull(),
  tipo: varchar('tipo', { length: 80 }).notNull(),
  emissor: varchar('emissor', { length: 80 }).notNull(),
  numero: varchar('numero', { length: 40 }).notNull(),
  dataValidade: date('data_validade', { mode: 'string' }).notNull(),
  observacao: varchar('observacao', { length: 300 }),
}, (t) => [
  foreignKey({ name: 'licencas_usina_id_fkey', columns: [t.usinaId], foreignColumns: [usinas.id] }).onDelete('restrict'),
  index('licencas_usina_id_idx').on(t.usinaId),
  index('licencas_data_validade_idx').on(t.dataValidade),
  uniqueIndex('licencas_numero_unico').on(t.usinaId, t.tipo, sql`lower(${t.numero})`),
]);

export const manutencoes = pgTable('manutencoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  usinaId: uuid('usina_id').notNull(),
  titulo: varchar('titulo', { length: 100 }).notNull(),
  responsavel: varchar('responsavel', { length: 80 }).notNull(),
  prazo: date('prazo', { mode: 'string' }).notNull(),
  prioridade: prioridadeEnum('prioridade').notNull(),
  status: statusManutencaoEnum('status').notNull(),
  concluidaEm: date('concluida_em', { mode: 'string' }),
}, (t) => [
  foreignKey({ name: 'manutencoes_usina_id_fkey', columns: [t.usinaId], foreignColumns: [usinas.id] }).onDelete('restrict'),
  index('manutencoes_usina_id_idx').on(t.usinaId),
  index('manutencoes_prazo_idx').on(t.prazo),
]);

export const atividades = pgTable('atividades', {
  id: uuid('id').defaultRandom().primaryKey(),
  em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
  usuario: varchar('usuario', { length: 120 }).notNull(),
  descricao: text('descricao').notNull(),
}, (t) => [index('atividades_em_idx').on(t.em)]);

export const tentativasLogin = pgTable('tentativas_login', {
  chave: varchar('chave', { length: 320 }).primaryKey(),
  contagem: integer('contagem').notNull().default(0),
  bloqueadoAte: timestamp('bloqueado_ate', { withTimezone: true }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('tentativas_atualizado_idx').on(t.atualizadoEm)]);

/*
 * Condicionantes ambientais (Lote 8). Só a estrutura: as regras de negócio ficam nas rotas (Lotes 9 e 10).
 *
 * Calendário das periódicas: o próximo vencimento (`prazo`) é calculado a partir da âncora
 * (`prazo_inicial`) e do número de períodos cumpridos (`ciclo`). Editar prazo ou periodicidade
 * abre um calendário novo (`calendario` + 1, `ciclo` = 0, nova âncora). Assim um período é
 * identificado por (calendario, ciclo) e um calendário novo nunca colide com o histórico do antigo.
 */
export const categoriaCondicionanteEnum = pgEnum('categoria_condicionante',
  ['monitoramento', 'relatorio', 'compensacao', 'operacional', 'outro']);
export const periodicidadeCondicionanteEnum = pgEnum('periodicidade_condicionante',
  ['unica', 'mensal', 'trimestral', 'semestral', 'anual']);
export const statusCondicionanteEnum = pgEnum('status_condicionante',
  ['pendente', 'em_andamento', 'cumprida', 'encerrada']);

export const condicionantes = pgTable('condicionantes', {
  id: uuid('id').defaultRandom().primaryKey(),
  licencaId: uuid('licenca_id').notNull(),
  codigo: varchar('codigo', { length: 20 }).notNull(),
  descricao: varchar('descricao', { length: 500 }).notNull(),
  categoria: categoriaCondicionanteEnum('categoria').notNull(),
  responsavel: varchar('responsavel', { length: 80 }).notNull(),
  periodicidade: periodicidadeCondicionanteEnum('periodicidade').notNull(),
  /** Âncora do calendário atual. */
  prazoInicial: date('prazo_inicial', { mode: 'string' }).notNull(),
  /** Próximo vencimento: é o que alertas e dashboard olham. */
  prazo: date('prazo', { mode: 'string' }).notNull(),
  /** Número do calendário atual; sobe a cada reinício. */
  calendario: integer('calendario').notNull().default(1),
  /** Períodos cumpridos no calendário atual. */
  ciclo: integer('ciclo').notNull().default(0),
  status: statusCondicionanteEnum('status').notNull().default('pendente'),
  ultimoCumprimentoEm: date('ultimo_cumprimento_em', { mode: 'string' }),
  observacao: varchar('observacao', { length: 300 }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'condicionantes_licenca_id_fkey', columns: [t.licencaId], foreignColumns: [licencas.id] }).onDelete('restrict'),
  // Também atende a FK: começa por licenca_id, então não precisa de outro índice nessa coluna.
  uniqueIndex('condicionantes_codigo_unico').on(t.licencaId, sql`lower(${t.codigo})`),
  index('condicionantes_prazo_idx').on(t.prazo),
  check('condicionantes_textos_check',
    sql`btrim(${t.codigo}) <> '' AND btrim(${t.descricao}) <> '' AND btrim(${t.responsavel}) <> ''`),
  check('condicionantes_contadores_check', sql`${t.calendario} >= 1 AND ${t.ciclo} >= 0`),
  check('condicionantes_prazo_check', sql`${t.prazo} >= ${t.prazoInicial}`),
  // "cumprida" é estado final só da única; a periódica avança o prazo e volta a "pendente".
  check('condicionantes_cumprida_check',
    sql`${t.status} <> 'cumprida' OR (${t.periodicidade} = 'unica' AND ${t.ultimoCumprimentoEm} IS NOT NULL)`),
  // Única: o prazo nunca anda, e ciclo 1 significa exatamente "cumprida".
  check('condicionantes_unica_check',
    sql`${t.periodicidade} <> 'unica' OR (${t.prazo} = ${t.prazoInicial} AND ${t.ciclo} IN (0, 1) AND (${t.ciclo} = 1) = (${t.status} = 'cumprida'))`),
]);

/*
 * Histórico permanente dos cumprimentos. Nada é apagado: desfazer um cumprimento o CANCELA
 * (cancelado_em, cancelado_por, motivo). Só um cumprimento não cancelado por período.
 * Usuários não são excluídos pela aplicação (só desativados), por isso as FKs de usuário são RESTRICT.
 */
export const condicionanteCumprimentos = pgTable('condicionante_cumprimentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  condicionanteId: uuid('condicionante_id').notNull(),
  /** Período cumprido: calendário e ciclo em que a condicionante estava. */
  calendario: integer('calendario').notNull(),
  ciclo: integer('ciclo').notNull(),
  /** O vencimento daquele período. */
  prazoReferencia: date('prazo_referencia', { mode: 'string' }).notNull(),
  /** Data informada por quem registrou (a API impede data futura). */
  cumpridaEm: date('cumprida_em', { mode: 'string' }).notNull(),
  observacao: varchar('observacao', { length: 300 }),
  registradoPor: uuid('registrado_por').notNull(),
  registradoEm: timestamp('registrado_em', { withTimezone: true }).notNull().defaultNow(),
  canceladoEm: timestamp('cancelado_em', { withTimezone: true }),
  canceladoPor: uuid('cancelado_por'),
  motivoCancelamento: varchar('motivo_cancelamento', { length: 300 }),
}, (t) => [
  foreignKey({ name: 'condicionante_cumprimentos_condicionante_id_fkey', columns: [t.condicionanteId], foreignColumns: [condicionantes.id] }).onDelete('restrict'),
  foreignKey({ name: 'condicionante_cumprimentos_registrado_por_fkey', columns: [t.registradoPor], foreignColumns: [usuarios.id] }).onDelete('restrict'),
  foreignKey({ name: 'condicionante_cumprimentos_cancelado_por_fkey', columns: [t.canceladoPor], foreignColumns: [usuarios.id] }).onDelete('restrict'),
  // Um período só pode estar cumprido uma vez; cancelados não contam e continuam guardados.
  uniqueIndex('condicionante_cumprimentos_periodo_unico').on(t.condicionanteId, t.calendario, t.ciclo)
    .where(sql`${t.canceladoEm} IS NULL`),
  index('condicionante_cumprimentos_condicionante_idx').on(t.condicionanteId, t.registradoEm),
  check('condicionante_cumprimentos_contadores_check', sql`${t.calendario} >= 1 AND ${t.ciclo} >= 0`),
  // Cancelamento é tudo ou nada: data, quem cancelou e motivo preenchidos juntos.
  // "IS NOT NULL" explícito: num CHECK, uma comparação com NULL dá NULL, e NULL é aceito.
  check('condicionante_cumprimentos_cancelamento_check', sql`(${t.canceladoEm} IS NULL AND ${t.canceladoPor} IS NULL AND ${t.motivoCancelamento} IS NULL)
    OR (${t.canceladoEm} IS NOT NULL AND ${t.canceladoPor} IS NOT NULL AND ${t.motivoCancelamento} IS NOT NULL
      AND btrim(${t.motivoCancelamento}) <> '' AND ${t.canceladoEm} >= ${t.registradoEm})`),
]);

/** Preferências individuais — não interfere nos dados de usinas e licenças. */
export const preferenciasUsuario = pgTable('preferencias_usuario', {
  usuarioId: uuid('usuario_id').primaryKey(),
  tema: varchar('tema', { length: 12 }).notNull().default('sistema'),
  menuModo: varchar('menu_modo', { length: 12 }).notNull().default('expandido'),
  menuFixado: boolean('menu_fixado').notNull().default(true),
  avatarCor: varchar('avatar_cor', { length: 12 }).notNull().default('ambar'),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'preferencias_usuario_usuario_id_fkey', columns: [t.usuarioId], foreignColumns: [usuarios.id] }).onDelete('cascade'),
  check('preferencias_tema_valido', sql`${t.tema} IN ('claro', 'escuro', 'sistema')`),
  check('preferencias_menu_valido', sql`${t.menuModo} IN ('expandido', 'recolhido')`),
  check('preferencias_avatar_valido', sql`${t.avatarCor} IN ('ambar', 'azul', 'verde', 'violeta', 'rosa')`),
]);

/*
 * Documentos (Lote 13): só a estrutura. Metadados em `documentos`, bytes em `documentos_conteudo`
 * (1 para 1), para listar sem carregar os arquivos. Limite de 8 MB; tipos aceitos: PDF, PNG e JPEG,
 * conferidos pelo conteúdo em lib/armazenamento.ts. As regras que cruzam tabelas (licença da usina,
 * condicionante da licença, tamanho e SHA-256 iguais aos do conteúdo, arquivo imutável, documento
 * sempre com conteúdo) ficam em triggers escritos à mão no fim da migração 0003.
 */
export const TAMANHO_MAXIMO_DOCUMENTO = 8 * 1024 * 1024; // 8 MB, abaixo dos 10 MB que o proxy do Next aceita
export const MIMES_DOCUMENTO = ['application/pdf', 'image/png', 'image/jpeg'] as const;

export const tipoDocumentoEnum = pgEnum('tipo_documento', ['licenca', 'laudo', 'relatorio', 'comprovante', 'outro']);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const documentos = pgTable('documentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  usinaId: uuid('usina_id').notNull(),
  licencaId: uuid('licenca_id'),
  condicionanteId: uuid('condicionante_id'),
  titulo: varchar('titulo', { length: 120 }).notNull(),
  tipo: tipoDocumentoEnum('tipo').notNull(),
  /** Nome original já limpo (sem caminho nem caracteres de controle); só para exibir e baixar. */
  nomeArquivo: varchar('nome_arquivo', { length: 200 }).notNull(),
  /** Tipo detectado pelo conteúdo, nunca o informado pelo navegador. */
  mime: varchar('mime', { length: 30 }).notNull(),
  tamanhoBytes: integer('tamanho_bytes').notNull(),
  /** SHA-256 do conteúdo, em hexadecimal minúsculo. */
  sha256: char('sha256', { length: 64 }).notNull(),
  validade: date('validade', { mode: 'string' }),
  enviadoPor: uuid('enviado_por').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'documentos_usina_id_fkey', columns: [t.usinaId], foreignColumns: [usinas.id] }).onDelete('restrict'),
  foreignKey({ name: 'documentos_licenca_id_fkey', columns: [t.licencaId], foreignColumns: [licencas.id] }).onDelete('restrict'),
  foreignKey({ name: 'documentos_condicionante_id_fkey', columns: [t.condicionanteId], foreignColumns: [condicionantes.id] }).onDelete('restrict'),
  // Usuários não são excluídos pela aplicação (só desativados): quem enviou fica sempre conhecido.
  foreignKey({ name: 'documentos_enviado_por_fkey', columns: [t.enviadoPor], foreignColumns: [usuarios.id] }).onDelete('restrict'),
  index('documentos_usina_idx').on(t.usinaId),
  index('documentos_licenca_idx').on(t.licencaId),
  index('documentos_condicionante_idx').on(t.condicionanteId),
  check('documentos_textos_check', sql`btrim(${t.titulo}) <> '' AND btrim(${t.nomeArquivo}) <> ''`),
  check('documentos_mime_check', sql`${t.mime} IN ('application/pdf', 'image/png', 'image/jpeg')`),
  check('documentos_tamanho_check', sql`${t.tamanhoBytes} BETWEEN 1 AND 8388608`),
  check('documentos_sha256_check', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  // Condicionante só junto com a licença dela (a coerência entre as duas é conferida por trigger).
  check('documentos_condicionante_com_licenca_check', sql`${t.condicionanteId} IS NULL OR ${t.licencaId} IS NOT NULL`),
]);

export const documentosConteudo = pgTable('documentos_conteudo', {
  documentoId: uuid('documento_id').primaryKey(),
  dados: bytea('dados').notNull(),
}, (t) => [
  // Apagar o documento apaga o arquivo junto.
  foreignKey({ name: 'documentos_conteudo_documento_id_fkey', columns: [t.documentoId], foreignColumns: [documentos.id] }).onDelete('cascade'),
  check('documentos_conteudo_tamanho_check', sql`octet_length(${t.dados}) BETWEEN 1 AND 8388608`),
]);
