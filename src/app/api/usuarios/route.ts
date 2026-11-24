import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { criarUsuarioSchema, atualizarUsuarioSchema } from '@/schemas/autenticacao';
import { banco } from '@/lib/db';
import { usuarios } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { codigoPostgres } from '@/lib/db/erros';
import { emitirToken, enviarLinkRecuperacao } from '@/lib/recuperacao';
import { gerarHashSenha } from '@/lib/senhas';
import { erro, exigir, falhou, lerCorpo } from '@/lib/http';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sessao = await exigir(req, 'gerir_usuarios');
  if (falhou(sessao)) return sessao;
  const encontrados = await banco.select({ id: usuarios.id, email: usuarios.email, nome: usuarios.nome,
    papel: usuarios.papel, ativo: usuarios.ativo, criadoEm: usuarios.criadoEm }).from(usuarios);
  return NextResponse.json(encontrados, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req: NextRequest) {
  const sessao = await exigir(req, 'gerir_usuarios');
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, criarUsuarioSchema);
  if (!corpo.ok) return corpo.resposta;
  const dados = corpo.dados;
  // Senha desconhecida e aleatória: somente o link de convite permite ao novo usuário defini-la.
  const hash = await gerarHashSenha(randomBytes(48).toString('base64url'));
  try {
    const criado = await banco.transaction(async (tx) => {
      const [u] = await tx.insert(usuarios).values({ ...dados, senhaHash: hash }).returning();
      await registrar(tx, sessao.nome, `Criou a conta de ${u.nome}`);
      return u;
    });
    try {
      const link = await emitirToken(criado.id);
      await enviarLinkRecuperacao(criado.email, link, true);
    } catch {
      console.error('Não foi possível enviar o convite ao usuário criado.');
      return erro('Usuário criado, mas não foi possível enviar o convite. Solicite nova recuperação de senha.', 503);
    }
    return NextResponse.json({ id: criado.id, email: criado.email, nome: criado.nome, papel: criado.papel, ativo: criado.ativo, criadoEm: criado.criadoEm }, { status: 201 });
  } catch (e) {
    if (codigoPostgres(e) === '23505') return erro('Já existe um usuário com esse e-mail', 409, { email: 'E-mail já utilizado' });
    throw e;
  }
}
export async function PATCH(req: NextRequest) {
  const sessao = await exigir(req, 'gerir_usuarios');
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, atualizarUsuarioSchema);
  if (!corpo.ok) return corpo.resposta;
  const { id, ...mudancas } = corpo.dados;
  return banco.transaction(async (tx) => {
    // Serializa mudanças de privilégios para nunca deixar zero admins ativos.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(82340721)`);
    const [atual] = await tx.select().from(usuarios).where(eq(usuarios.id, id)).for('update');
    if (!atual) return erro('Usuário não encontrado', 404);
    if (id === sessao.sub && (mudancas.ativo === false || (mudancas.papel && mudancas.papel !== 'admin'))) {
      return erro('Não é permitido desativar nem rebaixar a própria conta', 403);
    }
    const novoPapel = mudancas.papel ?? atual.papel;
    const novoAtivo = mudancas.ativo ?? atual.ativo;
    if (atual.papel === 'admin' && atual.ativo && (!novoAtivo || novoPapel !== 'admin')) {
      const [admins] = await tx.select({ n: sql<number>`count(*)::integer` }).from(usuarios)
        .where(sql`${usuarios.papel} = 'admin' AND ${usuarios.ativo} = true`);
      if (admins.n <= 1) return erro('É necessário manter ao menos um administrador ativo', 409);
    }
    const revogar = atual.papel !== novoPapel || (atual.ativo && !novoAtivo);
    const [novo] = await tx.update(usuarios).set({ ...mudancas, atualizadoEm: new Date(),
      versaoToken: atual.versaoToken + (revogar ? 1 : 0) }).where(eq(usuarios.id, id)).returning();
    await registrar(tx, sessao.nome, `Atualizou a conta de ${novo.nome}`);
    return NextResponse.json({ id: novo.id, email: novo.email, nome: novo.nome, papel: novo.papel, ativo: novo.ativo });
  });
}
