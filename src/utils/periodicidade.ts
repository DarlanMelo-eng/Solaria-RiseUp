import type { CategoriaCondicionante, Condicionante, PeriodicidadeCondicionante, StatusCondicionante } from '@/types/solar';
import { diasAte, LIMITE_ALERTA_DIAS } from './datas';

/** Meses entre dois vencimentos de cada periodicidade. A única não se repete. */
export const MESES_DO_PERIODO: Record<Exclude<PeriodicidadeCondicionante, 'unica'>, number> = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/**
 * Soma meses a uma data AAAA-MM-DD sem fuso horário. Se o dia não existe no mês de destino,
 * usa o último dia (31/01 + 1 mês = 28/02 ou 29/02).
 */
export function somarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = total - novoAno * 12; // 0 a 11
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes + 1, 0)).getUTCDate();
  const d = Math.min(dia, ultimoDia);
  return `${String(novoAno).padStart(4, '0')}-${String(novoMes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Vencimento do período `ciclo` de um calendário. Sempre calculado a partir da âncora
 * (`prazoInicial`), nunca do vencimento anterior: assim 31/01 vira 28/02 e depois 31/03,
 * em vez de ficar preso no dia 28.
 */
export function vencimentoDoCiclo(prazoInicial: string, periodicidade: PeriodicidadeCondicionante, ciclo: number): string {
  if (periodicidade === 'unica') return prazoInicial;
  return somarMeses(prazoInicial, MESES_DO_PERIODO[periodicidade] * ciclo);
}

/** Situação exibida na interface, calculada a partir do status e do próximo vencimento. Nunca gravada. */
export type SituacaoCondicionante = 'vencida' | 'a_vencer' | 'em_dia' | 'cumprida' | 'encerrada';

/**
 * - `cumprida` (só única) e `encerrada` não são mais acompanhadas;
 * - as demais olham o próximo vencimento: passado = vencida; até 15 dias = a vencer (o mesmo limite
 *   das licenças); depois disso = em dia. Data inválida conta como vencida (falha segura).
 */
export function situacaoCondicionante(c: Pick<Condicionante, 'status' | 'prazo'>, agora = new Date()): SituacaoCondicionante {
  if (c.status === 'cumprida') return 'cumprida';
  if (c.status === 'encerrada') return 'encerrada';
  const dias = diasAte(c.prazo, agora);
  if (dias === null || dias < 0) return 'vencida';
  return dias <= LIMITE_ALERTA_DIAS ? 'a_vencer' : 'em_dia';
}

export const ROTULO_SITUACAO: Record<SituacaoCondicionante, string> = {
  vencida: 'Vencida', a_vencer: 'Vence em breve', em_dia: 'Em dia', cumprida: 'Cumprida', encerrada: 'Encerrada',
};
export const ROTULO_PERIODICIDADE: Record<PeriodicidadeCondicionante, string> = {
  unica: 'Única', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
};
export const ROTULO_CATEGORIA: Record<CategoriaCondicionante, string> = {
  monitoramento: 'Monitoramento', relatorio: 'Relatório', compensacao: 'Compensação', operacional: 'Operacional', outro: 'Outro',
};
export const ROTULO_STATUS_CONDICIONANTE: Record<StatusCondicionante, string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', cumprida: 'Cumprida', encerrada: 'Encerrada',
};
