CREATE TYPE "public"."categoria_condicionante" AS ENUM('monitoramento', 'relatorio', 'compensacao', 'operacional', 'outro');--> statement-breakpoint
CREATE TYPE "public"."periodicidade_condicionante" AS ENUM('unica', 'mensal', 'trimestral', 'semestral', 'anual');--> statement-breakpoint
CREATE TYPE "public"."status_condicionante" AS ENUM('pendente', 'em_andamento', 'cumprida', 'encerrada');--> statement-breakpoint
CREATE TABLE "condicionante_cumprimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"condicionante_id" uuid NOT NULL,
	"calendario" integer NOT NULL,
	"ciclo" integer NOT NULL,
	"prazo_referencia" date NOT NULL,
	"cumprida_em" date NOT NULL,
	"observacao" varchar(300),
	"registrado_por" uuid NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelado_em" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelamento" varchar(300),
	CONSTRAINT "condicionante_cumprimentos_contadores_check" CHECK ("condicionante_cumprimentos"."calendario" >= 1 AND "condicionante_cumprimentos"."ciclo" >= 0),
	CONSTRAINT "condicionante_cumprimentos_cancelamento_check" CHECK (("condicionante_cumprimentos"."cancelado_em" IS NULL AND "condicionante_cumprimentos"."cancelado_por" IS NULL AND "condicionante_cumprimentos"."motivo_cancelamento" IS NULL)
    OR ("condicionante_cumprimentos"."cancelado_em" IS NOT NULL AND "condicionante_cumprimentos"."cancelado_por" IS NOT NULL AND "condicionante_cumprimentos"."motivo_cancelamento" IS NOT NULL
      AND btrim("condicionante_cumprimentos"."motivo_cancelamento") <> '' AND "condicionante_cumprimentos"."cancelado_em" >= "condicionante_cumprimentos"."registrado_em"))
);
--> statement-breakpoint
CREATE TABLE "condicionantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licenca_id" uuid NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"descricao" varchar(500) NOT NULL,
	"categoria" "categoria_condicionante" NOT NULL,
	"responsavel" varchar(80) NOT NULL,
	"periodicidade" "periodicidade_condicionante" NOT NULL,
	"prazo_inicial" date NOT NULL,
	"prazo" date NOT NULL,
	"calendario" integer DEFAULT 1 NOT NULL,
	"ciclo" integer DEFAULT 0 NOT NULL,
	"status" "status_condicionante" DEFAULT 'pendente' NOT NULL,
	"ultimo_cumprimento_em" date,
	"observacao" varchar(300),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "condicionantes_textos_check" CHECK (btrim("condicionantes"."codigo") <> '' AND btrim("condicionantes"."descricao") <> '' AND btrim("condicionantes"."responsavel") <> ''),
	CONSTRAINT "condicionantes_contadores_check" CHECK ("condicionantes"."calendario" >= 1 AND "condicionantes"."ciclo" >= 0),
	CONSTRAINT "condicionantes_prazo_check" CHECK ("condicionantes"."prazo" >= "condicionantes"."prazo_inicial"),
	CONSTRAINT "condicionantes_cumprida_check" CHECK ("condicionantes"."status" <> 'cumprida' OR ("condicionantes"."periodicidade" = 'unica' AND "condicionantes"."ultimo_cumprimento_em" IS NOT NULL)),
	CONSTRAINT "condicionantes_unica_check" CHECK ("condicionantes"."periodicidade" <> 'unica' OR ("condicionantes"."prazo" = "condicionantes"."prazo_inicial" AND "condicionantes"."ciclo" IN (0, 1) AND ("condicionantes"."ciclo" = 1) = ("condicionantes"."status" = 'cumprida')))
);
--> statement-breakpoint
ALTER TABLE "condicionante_cumprimentos" ADD CONSTRAINT "condicionante_cumprimentos_condicionante_id_fkey" FOREIGN KEY ("condicionante_id") REFERENCES "public"."condicionantes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condicionante_cumprimentos" ADD CONSTRAINT "condicionante_cumprimentos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condicionante_cumprimentos" ADD CONSTRAINT "condicionante_cumprimentos_cancelado_por_fkey" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condicionantes" ADD CONSTRAINT "condicionantes_licenca_id_fkey" FOREIGN KEY ("licenca_id") REFERENCES "public"."licencas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "condicionante_cumprimentos_periodo_unico" ON "condicionante_cumprimentos" USING btree ("condicionante_id","calendario","ciclo") WHERE "condicionante_cumprimentos"."cancelado_em" IS NULL;--> statement-breakpoint
CREATE INDEX "condicionante_cumprimentos_condicionante_idx" ON "condicionante_cumprimentos" USING btree ("condicionante_id","registrado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "condicionantes_codigo_unico" ON "condicionantes" USING btree ("licenca_id",lower("codigo"));--> statement-breakpoint
CREATE INDEX "condicionantes_prazo_idx" ON "condicionantes" USING btree ("prazo");