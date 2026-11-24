import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { banco } from '@/lib/db';
import { usuarios } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { erro, exigir, falhou, lerCorpo } from '@/lib/http';
import { IP_DESCONHECIDO } from '@/lib/ip';
import { emitirToken, enviarLinkRecuperacao } from '@/lib/recuperacao';
import { chavesTentativa, registrarFalhas, segundosBloqueado } from '@/lib/tentativas';
export const runtime = 'nodejs';

const reenviarConviteSchema = z.object({ id: z.uuid() });

type ModoEntrega = 'email' | 'terminal';
/**
 * Como o convite chega à pessoa. Mesma regra de src/lib/email.ts (um teste garante que continuam iguais):
 * sem SMTP_HOST/SMTP_FROM fora de produção, NENHUM e-mail sai e o link só aparece no terminal do servidor.
 * Em produção, sem SMTP o envio falha (503), então o modo é sempre "email".
 */
function modoEntrega(): ModoEntrega {
  const smtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
  return smtp || process.env.NODE_ENV === 'production' ? 'email' : 'terminal';
}

/** Informa à tela como os convites são entregues, sem enviar nada. Só administradores. */
export async function GET(req: NextRequest) {
  const sessao = await exigir(req, 'gerir_usuarios');
  if (falhou(sessao)) return sessao;
  return NextResponse.json({ entrega: modoEntrega() }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Reenvia o convite (link para definir a senha) de uma conta que já existe.
 *
 * Existe porque, quando o e-mail falha na criação, a conta fica cadastrada sem convite e
 * cadastrar de novo dá 409 (e-mail já usado). Agora o admin reenvia, sem duplicar a conta.
 *
 * Segurança:
 * - Só administradores (mesma permissão de criar contas), com checagem de origem (CSRF).
 * - O link vai só para o e-mail da própria conta e nunca aparece na resposta nem nos logs.
 * - Conta desativada não recebe link.
 * - Mesmo limite por e-mail da recuperação de senha: ninguém consegue lotar a caixa de entrada.
 */
export async function POST(req: NextRequest) {
  const sessao = await exigir(req, 'gerir_usuarios');
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, reenviarConviteSchema);
  if (!corpo.ok) return corpo.resposta;

  const [usuario] = await banco.select().from(usuarios).where(eq(usuarios.id, corpo.dados.id)).limit(1);
  if (!usuario) return erro('Usuário não encontrado', 404);
  if (!usuario.ativo) return erro('Reative a conta antes de reenviar o convite', 409);

  // Só a chave do e-mail: os envios do admin não devem contar contra o IP dele.
  const chaves = chavesTentativa('reset', usuario.email, IP_DESCONHECIDO);
  const espera = await segundosBloqueado(chaves);
  if (espera) {
    return erro(`Muitos envios para este e-mail. Tente novamente em ${Math.ceil(espera / 60)} min.`, 429);
  }
  await registrarFalhas(chaves);

  try {
    // emitirToken invalida qualquer link anterior: só o mais recente funciona.
    const link = await emitirToken(usuario.id);
    await enviarLinkRecuperacao(usuario.email, link, true);
  } catch {
    // Sem detalhes do erro: a mensagem do provedor de e-mail pode conter dados sensíveis.
    console.error('Falha ao reenviar o convite de um usuário.');
    return erro('O convite NÃO foi enviado: o serviço de e-mail está indisponível. Tente novamente mais tarde.', 503);
  }
  try {
    await banco.transaction((tx) => registrar(tx, sessao.nome, `Reenviou o convite de ${usuario.nome}`));
  } catch {
    // O convite JÁ saiu. Responder erro aqui faria o admin reenviar à toa (e gastar o limite de envios).
    console.error('Convite reenviado, mas não foi possível registrar no histórico.');
  }
  return NextResponse.json({ ok: true, entrega: modoEntrega() }, { headers: { 'Cache-Control': 'no-store' } });
}
