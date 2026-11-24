/** pg pode aninhar o erro original em cause no driver. */
export function codigoPostgres(e: unknown): string | undefined {
  if (!e || typeof e !== 'object') return;
  if ('code' in e && typeof e.code === 'string') return e.code;
  if ('cause' in e) return codigoPostgres(e.cause);
}

/**
 * Exclusão recusada porque outra linha ainda aponta para esta.
 * Até o PostgreSQL 17 uma FK com RESTRICT respondia 23503 (foreign_key_violation);
 * a partir do 18 responde 23001 (restrict_violation). As FKs NO ACTION continuam em 23503.
 */
export const bloqueadoPorRelacionamento = (e: unknown) => {
  const codigo = codigoPostgres(e);
  return codigo === '23503' || codigo === '23001';
};
