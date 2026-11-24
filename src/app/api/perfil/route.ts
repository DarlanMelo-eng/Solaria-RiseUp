import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { banco } from '@/lib/db';
import { usuarios, preferenciasUsuario } from '@/lib/db/schema';
import { buscarPerfil } from '@/lib/consultas';
import { registrar } from '@/lib/db/atividades';
import { exigir, falhou, lerCorpo, erro } from '@/lib/http';
import { atualizarPerfilSchema } from '@/schemas/perfil';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const perfil = await buscarPerfil(sessao.sub);
  if (!perfil) return erro('Usuário não encontrado', 404);
  return NextResponse.json(perfil, { headers });
}

export async function PATCH(req: NextRequest) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, atualizarPerfilSchema);
  if (!corpo.ok) return corpo.resposta;
  const { nome, ...preferencias } = corpo.dados;
  await banco.transaction(async (tx) => {
    if (nome !== undefined && nome !== sessao.nome) {
      await tx.update(usuarios).set({ nome, atualizadoEm: new Date() }).where(eq(usuarios.id, sessao.sub));
      await registrar(tx, nome, 'Atualizou o próprio perfil');
    }
    if (Object.keys(preferencias).length) {
      await tx.insert(preferenciasUsuario).values({ usuarioId: sessao.sub, ...preferencias })
        .onConflictDoUpdate({ target: preferenciasUsuario.usuarioId, set: { ...preferencias, atualizadoEm: new Date() } });
    }
  });
  // Os dados sensíveis da sessão continuam protegidos pelo cookie; a API usa sempre o banco.
  return GET(req);
}
