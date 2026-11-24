import { NextResponse, type NextRequest } from 'next/server';
import { loginSchema } from '@/schemas/solar';
import { erro, lerCorpo, protegerOrigem } from '@/lib/http';
import { COOKIE_SESSAO, DURACAO_SESSAO_SEG, criarToken } from '@/lib/sessao';
import { autenticar } from '@/lib/usuarios';
import { banco } from '@/lib/db';
import { registrar } from '@/lib/db/atividades';
import { obterIp } from '@/lib/ip';
import { chavesTentativa, limparFalhas, limparTentativasAntigas, registrarFalhas, segundosBloqueado } from '@/lib/tentativas';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const inicio = performance.now();
  const csrf = protegerOrigem(req);
  if (csrf) return csrf;
  const corpo = await lerCorpo(req, loginSchema);
  if (!corpo.ok) return corpo.resposta;
  const { senha } = corpo.dados;
  const email = corpo.dados.email.toLowerCase();
  const chaves = chavesTentativa('login', email, obterIp(req));
  const espera = await segundosBloqueado(chaves);
  if (espera > 0) return erro(`Muitas tentativas. Tente novamente em ${espera}s.`, 429);
  const sessao = await autenticar(email, senha);
  if (!sessao) {
    // A falha fica só na contagem de tentativas, nunca no histórico de atividades: ele guarda as
    // 50 últimas ações e qualquer pessoa, sem login, apagaria as ações da equipe errando a senha.
    await registrarFalhas(chaves);
    return erro('E-mail ou senha incorretos', 401);
  }
  // Sucesso limpa a contagem da conta; não zera o IP para evitar password spraying.
  await limparFalhas([chaves[0]]);
  await banco.transaction((tx) => registrar(tx, sessao.nome, 'Entrou no sistema'));
  if (Math.random() < 0.01) await limparTentativasAntigas();
  const res = NextResponse.json({ email: sessao.email, nome: sessao.nome, papel: sessao.papel });
  res.cookies.set(COOKIE_SESSAO, await criarToken(sessao), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: DURACAO_SESSAO_SEG,
  });
  if (process.env.NODE_ENV !== 'production') res.headers.set('Server-Timing', `login;dur=${(performance.now() - inicio).toFixed(1)}`);
  return res;
}
