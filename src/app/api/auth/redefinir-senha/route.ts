import { NextResponse, type NextRequest } from 'next/server';
import { redefinirSenhaSchema } from '@/schemas/autenticacao';
import { erro, lerCorpo, protegerOrigem } from '@/lib/http';
import { redefinirSenha } from '@/lib/recuperacao';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const csrf = protegerOrigem(req);
  if (csrf) return csrf;
  const corpo = await lerCorpo(req, redefinirSenhaSchema);
  if (!corpo.ok) return corpo.resposta;
  const estado = await redefinirSenha(corpo.dados.token, corpo.dados.senha);
  if (estado === 'senha_igual_email') return erro('Dados inválidos', 422, { senha: 'A senha não pode ser igual ao e-mail' });
  if (estado === 'invalido') return erro('Link inválido, expirado ou já utilizado', 400);
  return NextResponse.json({ ok: true, mensagem: 'Senha alterada. Entre novamente.' });
}
