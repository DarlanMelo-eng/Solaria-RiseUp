import { eq } from 'drizzle-orm';
import type { SessaoToken } from './sessao';
import { banco } from './db';
import { usuarios } from './db/schema';
import { conferirContraIsca, conferirSenha } from './senhas';

export async function autenticar(email: string, senha: string): Promise<SessaoToken | null> {
  const usuario = await banco.query.usuarios.findFirst({ where: eq(usuarios.email, email.trim().toLowerCase()) });
  if (!usuario) {
    await conferirContraIsca(senha);
    return null;
  }
  const correta = await conferirSenha(usuario.senhaHash, senha);
  if (!correta || !usuario.ativo) return null;
  return { sub: usuario.id, v: usuario.versaoToken, email: usuario.email, nome: usuario.nome, papel: usuario.papel };
}

export async function verificarUsuarioSessao(sessao: SessaoToken): Promise<SessaoToken | null> {
  const [usuario] = await banco.select({
    id: usuarios.id, email: usuarios.email, nome: usuarios.nome,
    papel: usuarios.papel, ativo: usuarios.ativo, versaoToken: usuarios.versaoToken,
  }).from(usuarios).where(eq(usuarios.id, sessao.sub)).limit(1);
  if (!usuario || !usuario.ativo || usuario.versaoToken !== sessao.v) return null;
  return { sub: usuario.id, v: usuario.versaoToken, email: usuario.email, nome: usuario.nome, papel: usuario.papel };
}
