import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { banco } from './db';
import { registrar } from './db/atividades';
import { resetTokens, usuarios } from './db/schema';
import { enviarEmail } from './email';
import { gerarHashSenha } from './senhas';
import { senhaIgualEmail } from '@/schemas/autenticacao';

export const MENSAGEM_RECUPERACAO = 'Se o e-mail existir, enviaremos as instruções';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const tokenUtilizavel = (r: { usadoEm: Date | null; expiraEm: Date }, agora: Date) =>
  r.usadoEm === null && r.expiraEm.getTime() > agora.getTime();
export const compararHashes = (recebido: string, gravado: string | null) => {
  const a = Buffer.from(recebido, 'hex');
  const b = Buffer.from(gravado ?? '0'.repeat(64), 'hex');
  return a.length === b.length && timingSafeEqual(a, b) && gravado !== null;
};

function urlRecuperacao(token: string) {
  const origem = process.env.APP_URL;
  if (!origem) throw new Error('APP_URL obrigatório para enviar links de redefinição.');
  if (process.env.NODE_ENV === 'production' && !origem.startsWith('https://')) {
    throw new Error('APP_URL deve usar HTTPS em produção.');
  }
  const url = new URL('/redefinir-senha', origem);
  url.searchParams.set('token', token);
  return url.toString();
}

/** Só persiste SHA-256; invalida convites e pedidos anteriores. */
export async function emitirToken(usuarioId: string, ip?: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await banco.transaction(async (tx) => {
    await tx.update(resetTokens).set({ usadoEm: new Date() }).where(and(eq(resetTokens.usuarioId, usuarioId), isNull(resetTokens.usadoEm)));
    await tx.insert(resetTokens).values({ usuarioId, tokenHash, expiraEm: new Date(Date.now() + 30 * 60_000), ip: ip ?? null });
  });
  return urlRecuperacao(token);
}

export async function enviarLinkRecuperacao(para: string, link: string, convite = false) {
  const assunto = convite ? 'Convite para o Solaria Management' : 'Recuperação de senha - Solaria Management';
  const texto = `${convite ? 'Você foi convidado a definir sua senha.' : 'Foi solicitada a redefinição da sua senha.'}\n\nUse este link (válido por 30 minutos):\n${link}\n\nSe não solicitou, ignore esta mensagem.`;
  await enviarEmail({ para, assunto, texto, linkDesenvolvimento: link });
}

export type ResultadoRedefinicao = 'ok' | 'invalido' | 'senha_igual_email';
export async function redefinirSenha(token: string, novaSenha: string): Promise<ResultadoRedefinicao> {
  // Calculado antes de obter bloqueio de linha, para não segurar transação durante Argon2id.
  const novoHash = await gerarHashSenha(novaSenha);
  const recebido = hashToken(token);
  const resultado = await banco.transaction(async (tx) => {
    const [r] = await tx.select().from(resetTokens).where(eq(resetTokens.tokenHash, recebido)).for('update');
    if (!compararHashes(recebido, r?.tokenHash ?? null) || !r || !tokenUtilizavel(r, new Date())) {
      return { estado: 'invalido' as const };
    }
    const [usuario] = await tx.select().from(usuarios).where(eq(usuarios.id, r.usuarioId)).for('update');
    if (!usuario || !usuario.ativo) return { estado: 'invalido' as const };
    if (senhaIgualEmail(novaSenha, usuario.email)) return { estado: 'senha_igual_email' as const };
    await tx.update(usuarios).set({ senhaHash: novoHash, versaoToken: usuario.versaoToken + 1, atualizadoEm: new Date() }).where(eq(usuarios.id, usuario.id));
    await tx.update(resetTokens).set({ usadoEm: new Date() }).where(and(eq(resetTokens.usuarioId, usuario.id), isNull(resetTokens.usadoEm)));
    await registrar(tx, usuario.nome, 'Redefiniu a senha');
    return { estado: 'ok' as const, email: usuario.email };
  });
  if (resultado.estado !== 'ok') return resultado.estado;
  try {
    await enviarEmail({ para: resultado.email, assunto: 'Sua senha foi alterada - Solaria Management',
      texto: 'A senha da sua conta Solaria Management foi alterada. Se não foi você, contate imediatamente o administrador.' });
  } catch {
    // A atualização JÁ foi confirmada. Nunca revertê-la por indisponibilidade de SMTP.
    console.error('Falha ao enviar a notificação de alteração de senha.');
  }
  return 'ok';
}
