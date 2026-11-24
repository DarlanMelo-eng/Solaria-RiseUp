import { NextResponse, type NextRequest } from 'next/server';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import { condicionanteSchema } from '@/schemas/solar';
import { banco } from '@/lib/db';
import { condicionantes, licencas, usinas } from '@/lib/db/schema';
import { registrar } from '@/lib/db/atividades';
import { codigoPostgres } from '@/lib/db/erros';
import { formatarCondicionante } from '@/lib/db/formatar';
import { erro, exigir, falhou, idValido, lerCorpo } from '@/lib/http';
export const runtime = 'nodejs';

// Rotas do Next só podem exportar handlers e configurações: a mensagem fica local.
const CODIGO_REPETIDO = 'Já existe uma condicionante com esse código nesta licença';

/** Lista, com filtros opcionais por licença e por usina (a usina vem da licença). */
export async function GET(req: NextRequest) {
  const sessao = await exigir(req);
  if (falhou(sessao)) return sessao;
  const licencaId = req.nextUrl.searchParams.get('licencaId');
  const usinaId = req.nextUrl.searchParams.get('usinaId');
  if (licencaId && !idValido(licencaId)) return erro('Identificador de licença inválido', 400);
  if (usinaId && !idValido(usinaId)) return erro('Identificador de usina inválido', 400);
  const linhas = await banco.select(getTableColumns(condicionantes)).from(condicionantes)
    .innerJoin(licencas, eq(licencas.id, condicionantes.licencaId))
    .where(and(licencaId ? eq(condicionantes.licencaId, licencaId) : undefined, usinaId ? eq(licencas.usinaId, usinaId) : undefined))
    .orderBy(asc(condicionantes.prazo), asc(condicionantes.codigo));
  return NextResponse.json(linhas.map(formatarCondicionante));
}

export async function POST(req: NextRequest) {
  const sessao = await exigir(req, 'escrever');
  if (falhou(sessao)) return sessao;
  const corpo = await lerCorpo(req, condicionanteSchema);
  if (!corpo.ok) return corpo.resposta;
  const d = corpo.dados;
  try {
    return await banco.transaction(async (tx) => {
      // Mesma ordem de travas das rotas de licença (licença, depois usina), para não haver deadlock.
      const [licenca] = await tx.select().from(licencas).where(eq(licencas.id, d.licencaId)).for('share');
      if (!licenca) return erro('Licença não encontrada', 404);
      const [usina] = await tx.select().from(usinas).where(eq(usinas.id, licenca.usinaId)).for('update');
      if (!usina || usina.status === 'inativa') return erro('Usina inativa: somente leitura', 403);
      const [c] = await tx.insert(condicionantes).values({
        licencaId: d.licencaId, codigo: d.codigo, descricao: d.descricao, categoria: d.categoria,
        responsavel: d.responsavel, periodicidade: d.periodicidade,
        // O prazo informado é o primeiro vencimento e a âncora do calendário 1.
        prazoInicial: d.prazo, prazo: d.prazo,
        status: d.status ?? 'pendente', observacao: d.observacao || null,
      }).returning();
      await registrar(tx, sessao.nome, `Cadastrou a condicionante ${c.codigo} em ${licenca.tipo} (${licenca.numero}), ${usina.nome}`);
      return NextResponse.json(formatarCondicionante(c), { status: 201 });
    });
  } catch (e) {
    if (codigoPostgres(e) === '23505') return erro(CODIGO_REPETIDO, 409, { codigo: 'Código já usado nesta licença' });
    throw e;
  }
}
