CREATE TYPE "public"."tipo_documento" AS ENUM('licenca', 'laudo', 'relatorio', 'comprovante', 'outro');--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usina_id" uuid NOT NULL,
	"licenca_id" uuid,
	"condicionante_id" uuid,
	"titulo" varchar(120) NOT NULL,
	"tipo" "tipo_documento" NOT NULL,
	"nome_arquivo" varchar(200) NOT NULL,
	"mime" varchar(30) NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"validade" date,
	"enviado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_textos_check" CHECK (btrim("documentos"."titulo") <> '' AND btrim("documentos"."nome_arquivo") <> ''),
	CONSTRAINT "documentos_mime_check" CHECK ("documentos"."mime" IN ('application/pdf', 'image/png', 'image/jpeg')),
	CONSTRAINT "documentos_tamanho_check" CHECK ("documentos"."tamanho_bytes" BETWEEN 1 AND 8388608),
	CONSTRAINT "documentos_sha256_check" CHECK ("documentos"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "documentos_condicionante_com_licenca_check" CHECK ("documentos"."condicionante_id" IS NULL OR "documentos"."licenca_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "documentos_conteudo" (
	"documento_id" uuid PRIMARY KEY NOT NULL,
	"dados" "bytea" NOT NULL,
	CONSTRAINT "documentos_conteudo_tamanho_check" CHECK (octet_length("documentos_conteudo"."dados") BETWEEN 1 AND 8388608)
);
--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_usina_id_fkey" FOREIGN KEY ("usina_id") REFERENCES "public"."usinas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_licenca_id_fkey" FOREIGN KEY ("licenca_id") REFERENCES "public"."licencas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_condicionante_id_fkey" FOREIGN KEY ("condicionante_id") REFERENCES "public"."condicionantes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_conteudo" ADD CONSTRAINT "documentos_conteudo_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documentos_usina_idx" ON "documentos" USING btree ("usina_id");--> statement-breakpoint
CREATE INDEX "documentos_licenca_idx" ON "documentos" USING btree ("licenca_id");--> statement-breakpoint
CREATE INDEX "documentos_condicionante_idx" ON "documentos" USING btree ("condicionante_id");--> statement-breakpoint
-- ============================================================================================
-- Daqui para baixo: ESCRITO À MÃO no Lote 13 (o Drizzle não gera triggers) e revisado junto.
-- Regras que cruzam tabelas e não cabem num CHECK. Todas recusam com SQLSTATE 23514
-- (check_violation) e com o nome da regra em CONSTRAINT, para a API (Lote 14) traduzir em 422/409.
-- As tabelas são citadas com "public." para o resultado não depender do search_path.
-- ============================================================================================
CREATE FUNCTION "public"."documentos_conferir"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  usina_da_licenca uuid;
  licenca_da_condicionante uuid;
BEGIN
  -- O arquivo de um documento não muda: para trocar, envia-se outro documento.
  IF TG_OP = 'UPDATE' AND (NEW.mime, NEW.tamanho_bytes, NEW.sha256, NEW.nome_arquivo)
      IS DISTINCT FROM (OLD.mime, OLD.tamanho_bytes, OLD.sha256, OLD.nome_arquivo) THEN
    RAISE EXCEPTION 'O arquivo de um documento não pode ser trocado; envie um documento novo'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'documentos_arquivo_imutavel';
  END IF;
  -- A licença precisa ser da usina. (Licença inexistente fica para a FK responder com 23503.)
  IF NEW.licenca_id IS NOT NULL THEN
    SELECT usina_id INTO usina_da_licenca FROM "public"."licencas" WHERE id = NEW.licenca_id;
    IF FOUND AND usina_da_licenca <> NEW.usina_id THEN
      RAISE EXCEPTION 'A licença informada não pertence à usina do documento'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'documentos_licenca_da_usina';
    END IF;
  END IF;
  -- A condicionante precisa ser da licença (o CHECK já exige a licença junto).
  IF NEW.condicionante_id IS NOT NULL THEN
    SELECT licenca_id INTO licenca_da_condicionante FROM "public"."condicionantes" WHERE id = NEW.condicionante_id;
    IF FOUND AND licenca_da_condicionante <> NEW.licenca_id THEN
      RAISE EXCEPTION 'A condicionante informada não pertence à licença do documento'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'documentos_condicionante_da_licenca';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "documentos_conferir" BEFORE INSERT OR UPDATE ON "public"."documentos"
  FOR EACH ROW EXECUTE FUNCTION "public"."documentos_conferir"();
--> statement-breakpoint
CREATE FUNCTION "public"."documentos_conteudo_conferir"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  meta record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'O conteúdo de um documento não pode ser alterado; envie um documento novo'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'documentos_arquivo_imutavel';
  END IF;
  -- Tamanho e SHA-256 gravados nos metadados precisam ser os do conteúdo de verdade.
  SELECT tamanho_bytes, sha256 INTO meta FROM "public"."documentos" WHERE id = NEW.documento_id;
  IF FOUND AND (octet_length(NEW.dados) <> meta.tamanho_bytes OR encode(sha256(NEW.dados), 'hex') <> meta.sha256) THEN
    RAISE EXCEPTION 'O conteúdo não confere com o tamanho e o SHA-256 registrados no documento'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'documentos_conteudo_confere';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "documentos_conteudo_conferir" BEFORE INSERT OR UPDATE ON "public"."documentos_conteudo"
  FOR EACH ROW EXECUTE FUNCTION "public"."documentos_conteudo_conferir"();
--> statement-breakpoint
-- Documento nunca fica sem arquivo: conferido no fim da transação (DEFERRABLE), para que
-- metadados e conteúdo possam ser gravados um depois do outro, na mesma transação.
CREATE FUNCTION "public"."documentos_exigir_conteudo"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  alvo uuid;
BEGIN
  IF TG_TABLE_NAME = 'documentos' THEN
    alvo := NEW.id;
  ELSE
    alvo := OLD.documento_id;
  END IF;
  IF EXISTS (SELECT 1 FROM "public"."documentos" WHERE id = alvo)
     AND NOT EXISTS (SELECT 1 FROM "public"."documentos_conteudo" WHERE documento_id = alvo) THEN
    RAISE EXCEPTION 'Documento sem arquivo: metadados e conteúdo precisam ser gravados na mesma transação'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'documentos_com_conteudo';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "documentos_exigir_conteudo" AFTER INSERT ON "public"."documentos"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."documentos_exigir_conteudo"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "documentos_conteudo_sem_orfao" AFTER DELETE ON "public"."documentos_conteudo"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."documentos_exigir_conteudo"();
