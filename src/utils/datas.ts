import type { Licenca, Manutencao, StatusLicenca, Usina } from '@/types/solar';

export const LIMITE_ALERTA_DIAS = 15; // licença: amarelo com 15 dias ou menos
export const LIMITE_MANUTENCAO_DIAS = 7; // manutenção: "vence em breve"

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Converte AAAA-MM-DD em dia absoluto (UTC). Retorna null se a data não existir no calendário. */
function diaAbsoluto(iso: string): number | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return Math.floor(d.getTime() / 86_400_000);
}

export function hojeISO(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export function dataValida(iso: string): boolean {
  return diaAbsoluto(iso) !== null;
}

/** Dias entre hoje (fuso local) e a data. Negativo = já passou. Null = data inválida. */
export function diasAte(iso: string, agora = new Date()): number | null {
  const alvo = diaAbsoluto(iso);
  const hoje = diaAbsoluto(hojeISO(agora));
  return alvo === null || hoje === null ? null : alvo - hoje;
}

export function formatarData(iso: string): string {
  const m = ISO.exec(iso);
  return m && dataValida(iso) ? `${m[3]}/${m[2]}/${m[1]}` : 'Data inválida';
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function calcularStatusLicenca(dataValidade: string, agora = new Date()): StatusLicenca {
  const dias = diasAte(dataValidade, agora);
  if (dias === null || dias < 0) return 'expirada'; // data inválida é tratada como pendência (falha segura)
  return dias <= LIMITE_ALERTA_DIAS ? 'proximo_vencimento' : 'valida';
}

export function descreverPrazo(iso: string, agora = new Date()): string {
  const d = diasAte(iso, agora);
  if (d === null) return 'Data inválida';
  if (d === 0) return 'vence hoje';
  if (d === 1) return 'vence amanhã';
  if (d > 1) return `faltam ${d} dias`;
  return d === -1 ? 'venceu ontem' : `venceu há ${-d} dias`;
}

export const manutencaoAtrasada = (m: Manutencao, agora = new Date()) => {
  if (m.status === 'concluida') return false;
  const d = diasAte(m.prazo, agora);
  return d === null || d < 0;
};

export const formatarCapacidade = (kwp: number) =>
  kwp >= 1000
    ? `${(kwp / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MWp`
    : `${kwp.toLocaleString('pt-BR')} kWp`;

export interface Alerta {
  id: string;
  tipo: 'licenca' | 'manutencao';
  gravidade: 'critica' | 'atencao';
  titulo: string;
  detalhe: string;
  usinaId: string;
  usinaNome: string;
  dias: number;
  href: string;
}

/** Pendências de usinas ativas (usinas inativas são somente leitura e não geram alerta). */
export function montarAlertas(
  usinas: Usina[],
  licencas: Licenca[],
  manutencoes: Manutencao[],
  agora = new Date(),
): Alerta[] {
  const ativas = new Map(usinas.filter((u) => u.status === 'ativa').map((u) => [u.id, u.nome]));
  const alertas: Alerta[] = [];

  for (const l of licencas) {
    const usinaNome = ativas.get(l.usinaId);
    if (!usinaNome) continue;
    const status = calcularStatusLicenca(l.dataValidade, agora);
    if (status === 'valida') continue;
    alertas.push({
      id: `l-${l.id}`,
      tipo: 'licenca',
      gravidade: status === 'expirada' ? 'critica' : 'atencao',
      titulo: `${l.tipo} · ${l.numero}`,
      detalhe: `${usinaNome} — ${descreverPrazo(l.dataValidade, agora)}`,
      usinaId: l.usinaId,
      usinaNome,
      dias: diasAte(l.dataValidade, agora) ?? -9999,
      href: `/usinas/${l.usinaId}?aba=licencas`,
    });
  }

  for (const m of manutencoes) {
    const usinaNome = ativas.get(m.usinaId);
    if (!usinaNome || m.status === 'concluida') continue;
    const dias = diasAte(m.prazo, agora) ?? -9999;
    const atrasada = dias < 0;
    if (!atrasada && dias > LIMITE_MANUTENCAO_DIAS) continue;
    alertas.push({
      id: `m-${m.id}`,
      tipo: 'manutencao',
      gravidade: atrasada ? 'critica' : 'atencao',
      titulo: m.titulo,
      detalhe: `${usinaNome} — ${descreverPrazo(m.prazo, agora)}`,
      usinaId: m.usinaId,
      usinaNome,
      dias,
      href: `/usinas/${m.usinaId}?aba=manutencoes`,
    });
  }

  return alertas.sort((a, b) => a.dias - b.dias);
}
