import type { Condicionante, CumprimentoCondicionante, Licenca, Usina } from '@/types/solar';
import { diasAte } from './datas';
import { situacaoCondicionante, type SituacaoCondicionante } from './periodicidade';

/*
 * Regras só de TELA para a lista de condicionantes: filtrar, ordenar e resumir o que já veio do
 * /api/dados. Nenhuma regra de negócio aqui: permissões, usina inativa, prazos e cancelamentos são
 * decididos pela API, e a tela mostra a mensagem que ela devolver.
 */

export interface FiltrosCondicionante {
  busca?: string;
  situacao?: SituacaoCondicionante | 'acompanhadas' | '';
  usinaId?: string;
  licencaId?: string;
  categoria?: string;
  periodicidade?: string;
}

/** Primeiro as que pedem ação; cumpridas e encerradas por último. */
export const ORDEM_SITUACAO: Record<SituacaoCondicionante, number> = { vencida: 0, a_vencer: 1, em_dia: 2, cumprida: 3, encerrada: 4 };
const ACOMPANHADAS: SituacaoCondicionante[] = ['vencida', 'a_vencer', 'em_dia'];

export function filtrarCondicionantes(
  lista: Condicionante[],
  filtros: FiltrosCondicionante,
  licencasPorId: Map<string, Licenca>,
  usinasPorId: Map<string, Usina>,
  agora = new Date(),
): Condicionante[] {
  const q = filtros.busca?.trim().toLowerCase() ?? '';
  const comSituacao = lista.flatMap((c) => {
    const licenca = licencasPorId.get(c.licencaId);
    const situacao = situacaoCondicionante(c, agora);
    if (filtros.licencaId && c.licencaId !== filtros.licencaId) return [];
    if (filtros.usinaId && licenca?.usinaId !== filtros.usinaId) return [];
    if (filtros.categoria && c.categoria !== filtros.categoria) return [];
    if (filtros.periodicidade && c.periodicidade !== filtros.periodicidade) return [];
    if (filtros.situacao === 'acompanhadas' ? !ACOMPANHADAS.includes(situacao) : filtros.situacao && situacao !== filtros.situacao) return [];
    if (q) {
      const usina = licenca ? usinasPorId.get(licenca.usinaId) : undefined;
      const campos = [c.codigo, c.descricao, c.responsavel, licenca?.numero ?? '', licenca?.tipo ?? '', usina?.nome ?? ''];
      if (!campos.some((t) => t.toLowerCase().includes(q))) return [];
    }
    return [{ c, ordem: ORDEM_SITUACAO[situacao], dias: diasAte(c.prazo, agora) ?? -99_999 }];
  });
  // Situação e depois prazo, calculados uma vez por item (mesma técnica de utils/ordenacao).
  return comSituacao.sort((a, b) => a.ordem - b.ordem || a.dias - b.dias || a.c.codigo.localeCompare(b.c.codigo, 'pt-BR'))
    .map((x) => x.c);
}

export function resumirCondicionantes(lista: Condicionante[], agora = new Date()) {
  const r = { total: lista.length, vencidas: 0, aVencer: 0, emDia: 0, finalizadas: 0 };
  for (const c of lista) {
    const s = situacaoCondicionante(c, agora);
    if (s === 'vencida') r.vencidas++;
    else if (s === 'a_vencer') r.aVencer++;
    else if (s === 'em_dia') r.emDia++;
    else r.finalizadas++;
  }
  return r;
}

/**
 * Em qual linha do histórico mostrar o botão "Desfazer": o cumprimento válido do período
 * imediatamente anterior ao atual, no calendário atual. A API confere de novo e responde 409 se a
 * tela estiver desatualizada; isto só evita mostrar o botão onde ele certamente falharia.
 */
export function cumprimentoDesfazivel(c: Pick<Condicionante, 'calendario' | 'ciclo'>, historico: CumprimentoCondicionante[]) {
  return historico.find((h) => !h.canceladoEm && h.calendario === c.calendario && h.ciclo === c.ciclo - 1);
}
