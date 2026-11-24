CREATE TABLE IF NOT EXISTS "preferencias_usuario" (
  "usuario_id" uuid PRIMARY KEY NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
  "tema" varchar(12) DEFAULT 'sistema' NOT NULL,
  "menu_modo" varchar(12) DEFAULT 'expandido' NOT NULL,
  "menu_fixado" boolean DEFAULT true NOT NULL,
  "avatar_cor" varchar(12) DEFAULT 'ambar' NOT NULL,
  "atualizado_em" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "preferencias_tema_valido" CHECK ("tema" IN ('claro','escuro','sistema')),
  CONSTRAINT "preferencias_menu_valido" CHECK ("menu_modo" IN ('expandido','recolhido')),
  CONSTRAINT "preferencias_avatar_valido" CHECK ("avatar_cor" IN ('ambar','azul','verde','violeta','rosa'))
);
