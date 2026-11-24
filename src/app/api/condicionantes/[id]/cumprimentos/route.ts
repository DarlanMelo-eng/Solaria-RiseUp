import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { cumprimentoSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { condicionanteCumprimentos, condicionantes } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { buscarCumprimentos, travarCondicionante } from '@/lib/db/condicionantes';
import { codigoPostgres } from '@/lib/db/erros';
import { formatarCondicionante } from '@/lib/db/formatar';
import { hojeServidor } from '@/lib/fuso';
import { erro, exigir, falhou, idValido, lerCorpo, type Contexto } from '@/lib/http';
import { vencimentoDoCiclo } from '@/utils/periodicidade';
export const runtime = 'nodejs';

const JA_CUMPRIDO = 'Este vencimento já foi cumprido ou foi alterado. Recarregue a condicionante e confira o próximo vencimento.';

/** Histórico completo: todos os calendários, com os cancelamentos. */
export async function GET(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const [existe] = await banco.select({ id: condicionantes.id }).from(condicionantes).where(eq(condicionantes.id, id));
  if (!existe) return erro('Condicionante não encontrada', 404);
  return NextResponse.json(await buscarCumprimentos(banco, id));
}

/**
 * Registra o cumprimento do vencimento atual.
 * - Periódica: grava o período no histórico, avança o próximo vencimento (calculado pela âncora)
 *   e volta a "pendente": ela continua acompanhada pelos alertas.
 * - Única: grava no histórico e fica "cumprida" (ciclo 1); o prazo não muda.
 * Duplicidade: a trava na condicionante serializa pedidos concorrentes, e o `prazoReferencia`
 * enviado precisa ser o vencimento atual. O índice único parcial do banco é a segunda barreira.
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const { id } = await params;
  if (!idValido(id)) return erro('Identificador inválido', 400);
  const corpo = await lerCorpo(req, cumprimentoSchema);
  if (!corpo.ok) return corpo.resposta;
  const d = corpo.dados;
  const cumpridaEm = d.cumpridaEm ?? hojeServidor();
  if (cumpridaEm > hojeServidor()) {
    return erro('Dados inválidos', 422, { cumpridaEm: 'A data de cumprimento não pode estar no futuro' });
  }
  try {
    return await banco.transaction(async (tx) => {
      const travado = await travarCondicionante(tx, id);
      if (!travado) return erro('Condicionante não encontrada', 404);
      const { atual, licenca, usina } = travado;
      if (usina.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
      if (atual.status === 'encerrada') return erro('Condicionante encerrada: reabra-a antes de registrar um cumprimento', 409);
      if (atual.status === 'cumprida') return erro('Esta condicionante única já está cumprida', 409);
      if (d.prazoReferencia !== atual.prazo) return erro(JA_CUMPRIDO, 409);

      const [registro] = await tx.insert(condicionanteCumprimentos).values({
        condicionanteId: id, calendario: atual.calendario, ciclo: atual.ciclo, prazoReferencia: atual.prazo,
        cumpridaEm, observacao: d.observacao || null, registradoPor: sessao.sub,
      }).returning();

      const unica = atual.periodicidade === 'unica';
      const ciclo = atual.ciclo + 1;
      const [novo] = await tx.update(condicionantes).set({
        ciclo,
        prazo: vencimentoDoCiclo(atual.prazoInicial, atual.periodicidade, ciclo),
        status: unica ? 'cumprida' : 'pendente',
        ultimoCumprimentoEm: cumpridaEm,
        atualizadoEm: new Date(),
      }).where(eq(condicionantes.id, id)).returning();

      await registrar(tx, sessao.nome, `Registrou o cumprimento da condicionante ${atual.codigo} (vencimento ${atual.prazo}) `
        + `de ${licenca.tipo} (${licenca.numero}), ${usina.nome}` + (unica ? '' : `; próximo vencimento ${novo.prazo}`));
      const [cumprimento] = await buscarCumprimentos(tx, id, registro.id);
      return NextResponse.json({ condicionante: formatarCondicionante(novo), cumprimento }, { status: 201 });
    });
  } catch (e) {
    // Só acontece se alguém gravar fora da API: a trava já serializa os pedidos.
    if (codigoPostgres(e) === '23505') return erro(JA_CUMPRIDO, 409);
    throw e;
  }
}
