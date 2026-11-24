import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { condicionanteEdicaoSchema } from '@/schemas/solar';
import { banco, type Transacao } from '@/lib/db';
import { condicionantes, licencas, usinas } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { bloqueadoPorRelacionamento, codigoPostgres } from '@/lib/db/erros';
import { formatarCondicionante } from '@/lib/db/formatar';
import { erro, exigir, falhou, idValido, lerCorpo, type Contexto } from '@/lib/http';
export const runtime = 'nodejs';

const CODIGO_REPETIDO = 'Já existe uma condicionante com esse código nesta licença';

/**
 * Trava licença, usina e condicionante, nessa ordem: a mesma da exclusão de licença
 * (licença, usina e, pela FK, as condicionantes). Ordem igual evita deadlock entre as rotas.
 * Devolve null se a condicionante não existe (ou foi excluída enquanto esperava a trava).
 */
async function travar(tx: Transacao, id: string, modo: 'no key update' | 'update') {
  const [base] = await tx.select({ licencaId: condicionantes.licencaId }).from(condicionantes).where(eq(condicionantes.id, id));
  if (!base) return null;
  const [licenca] = await tx.select().from(licencas).where(eq(licencas.id, base.licencaId)).for('share');
  if (!licenca) return null;
  const [usina] = await tx.select().from(usinas).where(eq(usinas.id, licenca.usinaId)).for('update');
  const [atual] = await tx.select().from(condicionantes).where(eq(condicionantes.id, id)).for(modo);
  if (!atual || !usina) return null;
  return { atual, licenca, usina };
}

export async function GET(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const [c] = await banco.select().from(condicionantes).where(eq(condicionantes.id, id));
  if (!c) return erro('Condicionante não encontrada', 404);
  return NextResponse.json(formatarCondicionante(c));
}

export async function PATCH(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const corpo = await lerCorpo(req, condicionanteEdicaoSchema);
  if (!corpo.ok) return corpo.resposta;
  const d = corpo.dados;
  try {
    return await banco.transaction(async (tx) => {
      // "no key update": a edição não muda o id, então não bloqueia a conferência de FK de outras transações.
      const travado = await travar(tx, id, 'no key update');
      if (!travado) return erro('Condicionante não encontrada', 404);
      const { atual, licenca, usina } = travado;
      if (usina.status === 'inativa') return erro('Usina inativa: somente leitura', 403);

      // Mudar prazo ou periodicidade abre um calendário novo (decisão B do Lote 8):
      // a âncora passa a ser o prazo, o ciclo volta a 0 e o histórico antigo fica no calendário anterior.
      const mudaCalendario = (d.prazo !== undefined && d.prazo !== atual.prazo)
        || (d.periodicidade !== undefined && d.periodicidade !== atual.periodicidade);
      if (atual.status === 'cumprida' && (mudaCalendario || d.status !== undefined)) {
        return erro('Condicionante cumprida: para mudar prazo, periodicidade ou situação, desfaça antes o cumprimento', 409);
      }
      const novoPrazo = d.prazo ?? atual.prazo;
      const [novo] = await tx.update(condicionantes).set({
        ...(d.codigo !== undefined && { codigo: d.codigo }),
        ...(d.descricao !== undefined && { descricao: d.descricao }),
        ...(d.categoria !== undefined && { categoria: d.categoria }),
        ...(d.responsavel !== undefined && { responsavel: d.responsavel }),
        ...(d.periodicidade !== undefined && { periodicidade: d.periodicidade }),
        ...(d.status !== undefined && { status: d.status }),
        ...(d.observacao !== undefined && { observacao: d.observacao || null }),
        ...(mudaCalendario && { prazoInicial: novoPrazo, prazo: novoPrazo, calendario: atual.calendario + 1, ciclo: 0 }),
        atualizadoEm: new Date(),
      }).where(eq(condicionantes.id, id)).returning();

      const acao = novo.status === 'encerrada' && atual.status !== 'encerrada' ? 'Encerrou'
        : atual.status === 'encerrada' && novo.status !== 'encerrada' ? 'Reabriu' : 'Editou';
      await registrar(tx, sessao.nome, `${acao} a condicionante ${novo.codigo} de ${licenca.tipo} (${licenca.numero}), ${usina.nome}`
        + (mudaCalendario ? ' e reiniciou o calendário de prazos' : ''));
      return NextResponse.json(formatarCondicionante(novo));
    });
  } catch (e) {
    if (codigoPostgres(e) === '23505') return erro(CODIGO_REPETIDO, 409, { codigo: 'Código já usado nesta licença' });
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'excluir');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  try {
    return await banco.transaction(async (tx) => {
      const travado = await travar(tx, id, 'update');
      if (!travado) return erro('Condicionante não encontrada', 404);
      const { atual, licenca, usina } = travado;
      if (usina.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
      await tx.delete(condicionantes).where(eq(condicionantes.id, id));
      await registrar(tx, sessao.nome, `Excluiu a condicionante ${atual.codigo} de ${licenca.tipo} (${licenca.numero}), ${usina.nome}`);
      return NextResponse.json({ ok: true });
    });
  } catch (e) {
    // Histórico de cumprimentos (RESTRICT): a evidência não pode ser apagada junto.
    if (bloqueadoPorRelacionamento(e)) {
      return erro('Esta condicionante tem cumprimentos registrados. Para preservar o histórico, encerre-a em vez de excluir', 409);
    }
    throw e;
  }
}
