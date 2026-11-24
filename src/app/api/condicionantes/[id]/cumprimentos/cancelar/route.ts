import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { cancelamentoCumprimentoSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { condicionanteCumprimentos, condicionantes } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { buscarCumprimentos, travarCondicionante } from '@/lib/db/condicionantes';
import { formatarCondicionante } from '@/lib/db/formatar';
import { erro, exigir, falhou, idValido, lerCorpo, type Contexto } from '@/lib/http';
import { vencimentoDoCiclo } from '@/utils/periodicidade';
export const runtime = 'nodejs';

/**
 * Desfaz o último cumprimento do calendário atual. NÃO apaga: grava data, autor e motivo do
 * cancelamento, e a condicionante volta ao vencimento daquele período. Só o último pode ser
 * desfeito, para o calendário nunca ficar com "buracos". O id enviado precisa ser exatamente esse
 * último: um pedido repetido, ou feito sobre uma tela desatualizada, recebe 409.
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'excluir');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const corpo = await lerCorpo(req, cancelamentoCumprimentoSchema);
  if (!corpo.ok) return corpo.resposta;
  const { cumprimentoId, motivo } = corpo.dados;

  return banco.transaction(async (tx) => {
    const travado = await travarCondicionante(tx, id);
    if (!travado) return erro('Condicionante não encontrada', 404);
    const { atual, licenca, usina } = travado;
    if (usina.status === 'inativa') return erro('Usina inativa: somente leitura', 403);

    const [alvo] = await tx.select().from(condicionanteCumprimentos)
      .where(and(eq(condicionanteCumprimentos.id, cumprimentoId), eq(condicionanteCumprimentos.condicionanteId, id)));
    if (!alvo) return erro('Cumprimento não encontrado nesta condicionante', 404);
    if (alvo.canceladoEm) return erro('Este cumprimento já foi cancelado', 409);
    // O último ativo do calendário atual é o do ciclo anterior ao atual.
    const ultimo = alvo.calendario === atual.calendario && alvo.ciclo === atual.ciclo - 1;
    if (!ultimo) return erro('Só o último cumprimento do calendário atual pode ser desfeito', 409);

    const [cancelado] = await tx.update(condicionanteCumprimentos)
      .set({ canceladoEm: sql`now()`, canceladoPor: sessao.sub, motivoCancelamento: motivo })
      .where(eq(condicionanteCumprimentos.id, alvo.id)).returning();

    // Último cumprimento que continua valendo, em qualquer calendário (ou nenhum).
    const [anterior] = await tx.select({ cumpridaEm: condicionanteCumprimentos.cumpridaEm }).from(condicionanteCumprimentos)
      .where(and(eq(condicionanteCumprimentos.condicionanteId, id), isNull(condicionanteCumprimentos.canceladoEm)))
      .orderBy(desc(condicionanteCumprimentos.registradoEm), desc(condicionanteCumprimentos.id)).limit(1);
    const ciclo = atual.ciclo - 1;
    const [novo] = await tx.update(condicionantes).set({
      ciclo,
      prazo: vencimentoDoCiclo(atual.prazoInicial, atual.periodicidade, ciclo),
      // Única volta a pendente; periódica mantém a situação (pendente ou em andamento).
      status: atual.status === 'cumprida' ? 'pendente' : atual.status,
      ultimoCumprimentoEm: anterior?.cumpridaEm ?? null,
      atualizadoEm: new Date(),
    }).where(eq(condicionantes.id, id)).returning();

    await registrar(tx, sessao.nome, `Desfez o cumprimento da condicionante ${atual.codigo} (vencimento ${cancelado.prazoReferencia}) `
      + `de ${licenca.tipo} (${licenca.numero}), ${usina.nome}. Motivo: ${motivo}`);
    const [cumprimento] = await buscarCumprimentos(tx, id, cancelado.id);
    return NextResponse.json({ condicionante: formatarCondicionante(novo), cumprimento });
  });
}
