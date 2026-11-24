import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { banco } from '@/lib/db';
import { resetTokens, usuarios } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { erro, exigir, falhou, lerCorpo } from '@/lib/http';
import { alterarSenhaSchema, senhaIgualEmail } from '@/schemas/autenticacao';
import { conferirSenha, gerarHashSenha } from '@/lib/senhas';
import { chavesTentativa, limparFalhas, registrarFalhas, segundosBloqueado } from '@/lib/tentativas';
import { obterIp } from '@/lib/ip';
import { enviarEmail } from '@/lib/email';
import { COOKIE_SESSAO } from '@/lib/sessao';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, alterarSenhaSchema);
  if (!corpo.ok) return corpo.resposta;
  const { senhaAtual, novaSenha } = corpo.dados;
  if (senhaIgualEmail(novaSenha, sessao.email)) {
    return erro('Dados inválidos', 422, { novaSenha: 'A senha não pode ser igual ao e-mail' });
  }
  // Chaves isoladas das tentativas de login convencionais.
  const chaves = chavesTentativa('login', `troca:${sessao.email}`, `troca:${obterIp(req)}`);
  const espera = await segundosBloqueado(chaves);
  if (espera > 0) return erro(`Muitas tentativas. Tente novamente em ${espera}s.`, 429);

  const [usuario] = await banco.select({ senhaHash: usuarios.senhaHash }).from(usuarios)
    .where(and(eq(usuarios.id, sessao.sub), eq(usuarios.versaoToken, sessao.v), eq(usuarios.ativo, true))).limit(1);
  if (!usuario) return erro('Sessão inválida', 401);
  if (!(await conferirSenha(usuario.senhaHash, senhaAtual))) {
    await registrarFalhas(chaves);
    await banco.transaction((tx) => registrar(tx, 'Sistema', 'Tentativa inválida de alteração de senha'));
    return erro('Dados inválidos', 422, { senhaAtual: 'Senha atual incorreta' });
  }
  if (await conferirSenha(usuario.senhaHash, novaSenha)) {
    return erro('Dados inválidos', 422, { novaSenha: 'Escolha uma senha diferente da atual' });
  }

  const senhaHash = await gerarHashSenha(novaSenha);
  const alterado = await banco.transaction(async (tx) => {
    // Verificação de versão evita alterações concorrentes que sobrescrevam uma revogação.
    const [atualizado] = await tx.update(usuarios).set({ senhaHash,
      versaoToken: sql`${usuarios.versaoToken} + 1`, atualizadoEm: new Date() })
      .where(and(eq(usuarios.id, sessao.sub), eq(usuarios.versaoToken, sessao.v), eq(usuarios.ativo, true)))
      .returning({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email });
    if (!atualizado) return null;
    await tx.update(resetTokens).set({ usadoEm: new Date() })
      .where(and(eq(resetTokens.usuarioId, atualizado.id), isNull(resetTokens.usadoEm)));
    await registrar(tx, atualizado.nome, 'Alterou sua senha');
    return atualizado;
  });
  if (!alterado) return erro('Sua sessão mudou. Entre novamente.', 401);
  await limparFalhas(chaves);
  try {
    await enviarEmail({ para: alterado.email, assunto: 'Sua senha foi alterada - Solaria Management',
      texto: 'A senha da sua conta Solaria Management foi alterada. Se não foi você, procure o administrador.' });
  } catch {
    console.error('Falha ao enviar aviso de alteração de senha.');
  }
  const resposta = NextResponse.json({ ok: true, mensagem: 'Senha alterada. Entre novamente.' },
    { headers: { 'Cache-Control': 'no-store' } });
  resposta.cookies.set(COOKIE_SESSAO, '', { httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return resposta;
}
