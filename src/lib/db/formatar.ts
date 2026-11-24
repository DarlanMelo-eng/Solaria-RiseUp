import type { Atividade, Condicionante, CumprimentoCondicionante, Licenca, Manutencao, Usina } from '@/types/solar';
import { atividades, condicionanteCumprimentos, condicionantes, licencas, manutencoes, usinas } from './schema';

type Registro<T extends { $inferSelect: object }> = T['$inferSelect'];
export const formatarUsina = (u: Registro<typeof usinas>): Usina => ({ ...u });
export const formatarLicenca = (l: Registro<typeof licencas>): Licenca => ({ ...l, observacao: l.observacao ?? undefined });
export const formatarManutencao = (m: Registro<typeof manutencoes>): Manutencao => ({ ...m, concluidaEm: m.concluidaEm ?? undefined });
export const formatarAtividade = (a: Registro<typeof atividades>): Atividade => ({ id: a.id, em: a.em.toISOString(), usuario: a.usuario, descricao: a.descricao });
export const formatarCondicionante = (c: Registro<typeof condicionantes>): Condicionante => ({
  ...c,
  ultimoCumprimentoEm: c.ultimoCumprimentoEm ?? undefined,
  observacao: c.observacao ?? undefined,
  criadoEm: c.criadoEm.toISOString(),
  atualizadoEm: c.atualizadoEm.toISOString(),
});
type LinhaCumprimento = Registro<typeof condicionanteCumprimentos> & { registradoPorNome: string; canceladoPorNome: string | null };
export const formatarCumprimento = (c: LinhaCumprimento): CumprimentoCondicionante => ({
  id: c.id, condicionanteId: c.condicionanteId, calendario: c.calendario, ciclo: c.ciclo,
  prazoReferencia: c.prazoReferencia, cumpridaEm: c.cumpridaEm, observacao: c.observacao ?? undefined,
  registradoPor: c.registradoPor, registradoPorNome: c.registradoPorNome, registradoEm: c.registradoEm.toISOString(),
  canceladoEm: c.canceladoEm?.toISOString(), canceladoPor: c.canceladoPor ?? undefined,
  canceladoPorNome: c.canceladoPorNome ?? undefined, motivoCancelamento: c.motivoCancelamento ?? undefined,
});
