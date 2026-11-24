-- Reversão da migração 0002 (condicionantes). NÃO É EXECUTADA AUTOMATICAMENTE.
-- Use só se a 0002 precisar ser desfeita e as tabelas novas estiverem VAZIAS.
-- Com dados nas tabelas novas, restaure o backup (pg_restore) em vez deste script.
-- Sem CASCADE de propósito: se algo depender dessas tabelas, o script para e nada é desfeito.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM condicionantes) OR EXISTS (SELECT 1 FROM condicionante_cumprimentos) THEN
    RAISE EXCEPTION 'As tabelas de condicionantes têm dados. Restaure o backup em vez de usar este script.';
  END IF;
END $$;
DROP TABLE condicionante_cumprimentos;
DROP TABLE condicionantes;
DROP TYPE status_condicionante;
DROP TYPE periodicidade_condicionante;
DROP TYPE categoria_condicionante;
-- Remove o registro da 0002 do controle do Drizzle. Usa o "when" do journal (created_at), e não o
-- hash: no Windows o Git pode converter as quebras de linha do .sql e mudar o hash do arquivo.
DO $$
DECLARE removidos integer;
BEGIN
  DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1795390431381;
  GET DIAGNOSTICS removidos = ROW_COUNT;
  IF removidos <> 1 THEN RAISE EXCEPTION 'Registro da migração 0002 não encontrado (%). Nada foi desfeito.', removidos; END IF;
END $$;
COMMIT;
