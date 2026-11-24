CREATE TYPE "papel_usuario" AS ENUM ('admin', 'gestor', 'consulta');
--> statement-breakpoint
CREATE TYPE "status_usina" AS ENUM ('ativa', 'inativa');
--> statement-breakpoint
CREATE TYPE "prioridade_manutencao" AS ENUM ('baixa', 'media', 'alta');
--> statement-breakpoint
CREATE TYPE "status_manutencao" AS ENUM ('pendente', 'em_andamento', 'concluida');
--> statement-breakpoint

CREATE TABLE "usuarios" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "email" varchar(254) NOT NULL UNIQUE,
 "nome" varchar(120) NOT NULL,
 "papel" "papel_usuario" NOT NULL,
 "senha_hash" text NOT NULL,
 "ativo" boolean DEFAULT true NOT NULL,
 "versao_token" integer DEFAULT 0 NOT NULL,
 "criado_em" timestamptz DEFAULT now() NOT NULL,
 "atualizado_em" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "usuarios_email_minusculo" CHECK (email = lower(email))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_lower_unico" ON "usuarios" (lower("email"));
--> statement-breakpoint

CREATE TABLE "reset_tokens" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
 "token_hash" varchar(64) NOT NULL UNIQUE,
 "expira_em" timestamptz NOT NULL,
 "usado_em" timestamptz,
 "criado_em" timestamptz DEFAULT now() NOT NULL,
 "ip" varchar(64)
);
--> statement-breakpoint
CREATE INDEX "reset_tokens_usuario_abertos_idx" ON "reset_tokens" ("usuario_id", "expira_em");
--> statement-breakpoint

CREATE TABLE "usinas" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "nome" varchar(80) NOT NULL,
 "localizacao" varchar(180) NOT NULL,
 "capacidade_kwp" double precision NOT NULL CHECK (capacidade_kwp > 0),
 "status" "status_usina" NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "usinas_nome_lower_unico" ON "usinas" (lower("nome"));
--> statement-breakpoint

CREATE TABLE "licencas" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "usina_id" uuid NOT NULL REFERENCES "usinas"("id") ON DELETE RESTRICT,
 "tipo" varchar(80) NOT NULL,
 "emissor" varchar(80) NOT NULL,
 "numero" varchar(40) NOT NULL,
 "data_validade" date NOT NULL,
 "observacao" varchar(300)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "licencas_numero_unico" ON "licencas" ("usina_id", "tipo", lower("numero"));
--> statement-breakpoint
CREATE INDEX "licencas_usina_id_idx" ON "licencas" ("usina_id");
--> statement-breakpoint
CREATE INDEX "licencas_data_validade_idx" ON "licencas" ("data_validade");
--> statement-breakpoint

CREATE TABLE "manutencoes" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "usina_id" uuid NOT NULL REFERENCES "usinas"("id") ON DELETE RESTRICT,
 "titulo" varchar(100) NOT NULL,
 "responsavel" varchar(80) NOT NULL,
 "prazo" date NOT NULL,
 "prioridade" "prioridade_manutencao" NOT NULL,
 "status" "status_manutencao" NOT NULL,
 "concluida_em" date
);
--> statement-breakpoint
CREATE INDEX "manutencoes_usina_id_idx" ON "manutencoes" ("usina_id");
--> statement-breakpoint
CREATE INDEX "manutencoes_prazo_idx" ON "manutencoes" ("prazo");
--> statement-breakpoint

CREATE TABLE "atividades" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "em" timestamptz DEFAULT now() NOT NULL,
 "usuario" varchar(120) NOT NULL,
 "descricao" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "atividades_em_idx" ON "atividades" ("em");
--> statement-breakpoint

CREATE TABLE "tentativas_login" (
 "chave" varchar(320) PRIMARY KEY NOT NULL,
 "contagem" integer DEFAULT 0 NOT NULL,
 "bloqueado_ate" timestamptz,
 "atualizado_em" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tentativas_atualizado_idx" ON "tentativas_login" ("atualizado_em");
