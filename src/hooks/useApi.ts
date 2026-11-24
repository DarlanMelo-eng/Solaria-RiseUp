'use client';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { mesclarLista } from '@/lib/mesclar-lista';
import type {
  CancelamentoCumprimentoDados, CondicionanteDados, CondicionanteEdicao, CumprimentoDados, LicencaDados, ManutencaoDados, UsinaDados,
} from '@/schemas/solar';
import type {
  Atividade, Condicionante, CumprimentoCondicionante, DadosOperacionais, Licenca, Manutencao, Sessao, Usina,
} from '@/types/solar';

export class ApiError extends Error {
  constructor(message: string, public status: number, public detalhes?: Record<string, string>) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...resto } = init ?? {};
  const headers = new Headers(resto.headers);
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(resto.method?.toUpperCase() ?? '') && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, {
    ...resto,
    headers,
    ...(json !== undefined && { body: JSON.stringify(json) }),
    cache: 'no-store',
  });
  if (res.status === 401 && url !== '/api/auth/login') {
    // Recarga completa de propósito: descarta todo o estado em memória da conta que expirou.
    const login = new URL('/login', window.location.origin);
    login.searchParams.set('next', window.location.pathname + window.location.search);
    window.location.replace(login);
    throw new ApiError('Sessão expirada', 401);
  }
  const corpo: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const resposta = corpo && typeof corpo === 'object' ? corpo as { erro?: string; detalhes?: Record<string, string> } : null;
    throw new ApiError(resposta?.erro ?? 'Erro inesperado. Tente novamente.', res.status, resposta?.detalhes);
  }
  return corpo as T;
}

type Recurso = keyof DadosOperacionais;
type Acao = 'criar' | 'editar' | 'excluir';

export const useSessao = () => useQuery({ queryKey: ['sessao'], queryFn: () => api<Sessao>('/api/auth/me'), staleTime: 5 * 60_000 });
const DADOS_CHAVE = ['dados'] as const;
const LISTA_VAZIA_USINAS: Usina[] = [];
const LISTA_VAZIA_LICENCAS: Licenca[] = [];
const LISTA_VAZIA_MANUTENCOES: Manutencao[] = [];
const LISTA_VAZIA_CONDICIONANTES: Condicionante[] = [];

export function useDados() {
  const q = useQuery({
    queryKey: DADOS_CHAVE,
    queryFn: () => api<DadosOperacionais>('/api/dados'),
    staleTime: 60_000,
  });
  return {
    usinas: q.data?.usinas ?? LISTA_VAZIA_USINAS,
    licencas: q.data?.licencas ?? LISTA_VAZIA_LICENCAS,
    manutencoes: q.data?.manutencoes ?? LISTA_VAZIA_MANUTENCOES,
    condicionantes: q.data?.condicionantes ?? LISTA_VAZIA_CONDICIONANTES,
    carregando: q.isPending,
    atualizando: q.isFetching && !q.isPending,
    // Em uma falha temporária de revalidação, preserva os dados já carregados.
    erro: q.isError && !q.data,
    recarregar: () => { void q.refetch(); },
  };
}

export const useAtividades = () => useQuery({ queryKey: ['atividades'], queryFn: () => api<Atividade[]>('/api/atividades'), staleTime: 45_000 });

/** Atualiza a lista em memória somente após o servidor confirmar sucesso. */
function aplicarResultado(qc: QueryClient, recurso: Recurso, acao: Acao, resultado: unknown, id?: string) {
  qc.setQueryData<DadosOperacionais>(DADOS_CHAVE, (dados) => {
    if (!dados) return dados;
    switch (recurso) {
      case 'usinas':
        return { ...dados, usinas: mesclarLista(dados.usinas, acao, resultado as Usina, id) };
      case 'licencas':
        return { ...dados, licencas: mesclarLista(dados.licencas, acao, resultado as Licenca, id) };
      case 'manutencoes':
        return { ...dados, manutencoes: mesclarLista(dados.manutencoes, acao, resultado as Manutencao, id) };
      case 'condicionantes':
        return { ...dados, condicionantes: mesclarLista(dados.condicionantes, acao, resultado as Condicionante, id) };
    }
  });
}

function useMutacao<V, R>(
  fn: (v: V) => Promise<R>,
  recurso: Recurso,
  acao: Acao,
  sucesso: string,
  idDaEntrada: (v: V) => string | undefined = () => undefined,
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (resultado, entrada) => {
      // Não espere 3 refetches + histórico para o modal fechar: os dados já vieram da API.
      aplicarResultado(qc, recurso, acao, resultado, idDaEntrada(entrada));
      toast.sucesso(sucesso);
      // Histórico não bloqueia o usuário nem o formulário.
      void qc.invalidateQueries({ queryKey: ['atividades'] });
    },
    onError: (e: Error) => { if (!(e instanceof ApiError && e.detalhes)) toast.erro(e.message); },
  });
}

const enviar = <T,>(metodo: string, url: string, json?: unknown) => api<T>(url, { method: metodo, json });

export const useCriarUsina = () => useMutacao((d: UsinaDados) => enviar<Usina>('POST', '/api/usinas', d), 'usinas', 'criar', 'Usina cadastrada');
export const useEditarUsina = () => useMutacao((v: { id: string; dados: Partial<UsinaDados> }) => enviar<Usina>('PATCH', `/api/usinas/${v.id}`, v.dados), 'usinas', 'editar', 'Usina atualizada');
export const useExcluirUsina = () => useMutacao((id: string) => enviar<{ ok: true }>('DELETE', `/api/usinas/${id}`), 'usinas', 'excluir', 'Usina excluída', (id) => id);

export const useCriarLicenca = () => useMutacao((d: LicencaDados) => enviar<Licenca>('POST', '/api/licencas', d), 'licencas', 'criar', 'Licença cadastrada');
export const useEditarLicenca = () => useMutacao((v: { id: string; dados: Partial<LicencaDados> }) => enviar<Licenca>('PATCH', `/api/licencas/${v.id}`, v.dados), 'licencas', 'editar', 'Licença atualizada');
export const useExcluirLicenca = () => useMutacao((id: string) => enviar<{ ok: true }>('DELETE', `/api/licencas/${id}`), 'licencas', 'excluir', 'Licença excluída', (id) => id);

export const useCriarManutencao = () => useMutacao((d: ManutencaoDados) => enviar<Manutencao>('POST', '/api/manutencoes', d), 'manutencoes', 'criar', 'Manutenção agendada');
export const useEditarManutencao = () => useMutacao((v: { id: string; dados: Partial<ManutencaoDados> }) => enviar<Manutencao>('PATCH', `/api/manutencoes/${v.id}`, v.dados), 'manutencoes', 'editar', 'Manutenção atualizada');
export const useExcluirManutencao = () => useMutacao((id: string) => enviar<{ ok: true }>('DELETE', `/api/manutencoes/${id}`), 'manutencoes', 'excluir', 'Manutenção excluída', (id) => id);

export const useCriarCondicionante = () => useMutacao((d: CondicionanteDados) => enviar<Condicionante>('POST', '/api/condicionantes', d), 'condicionantes', 'criar', 'Condicionante cadastrada');
export const useEditarCondicionante = () => useMutacao((v: { id: string; dados: CondicionanteEdicao }) => enviar<Condicionante>('PATCH', `/api/condicionantes/${v.id}`, v.dados), 'condicionantes', 'editar', 'Condicionante atualizada');
export const useExcluirCondicionante = () => useMutacao((id: string) => enviar<{ ok: true }>('DELETE', `/api/condicionantes/${id}`), 'condicionantes', 'excluir', 'Condicionante excluída', (id) => id);

const chaveCumprimentos = (condicionanteId: string) => ['cumprimentos', condicionanteId] as const;

/** Histórico de cumprimentos, carregado só quando a tela pede (não vem no /api/dados). */
export const useCumprimentos = (condicionanteId: string | null) => useQuery({
  queryKey: chaveCumprimentos(condicionanteId ?? ''),
  queryFn: () => api<CumprimentoCondicionante[]>(`/api/condicionantes/${condicionanteId}/cumprimentos`),
  enabled: Boolean(condicionanteId),
  staleTime: 30_000,
});

type RespostaCumprimento = { condicionante: Condicionante; cumprimento: CumprimentoCondicionante };

/** Registrar e desfazer devolvem a condicionante atualizada: ela substitui a da lista, e o histórico é recarregado. */
function useMutacaoCumprimento<V extends { condicionanteId: string }>(fn: (v: V) => Promise<RespostaCumprimento>, sucesso: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (resposta, entrada) => {
      aplicarResultado(qc, 'condicionantes', 'editar', resposta.condicionante, entrada.condicionanteId);
      toast.sucesso(sucesso);
      void qc.invalidateQueries({ queryKey: chaveCumprimentos(entrada.condicionanteId) });
      void qc.invalidateQueries({ queryKey: ['atividades'] });
    },
    onError: (e: Error) => { if (!(e instanceof ApiError && e.detalhes)) toast.erro(e.message); },
  });
}
export const useRegistrarCumprimento = () => useMutacaoCumprimento(
  (v: { condicionanteId: string; dados: CumprimentoDados }) =>
    enviar<RespostaCumprimento>('POST', `/api/condicionantes/${v.condicionanteId}/cumprimentos`, v.dados),
  'Cumprimento registrado');
export const useCancelarCumprimento = () => useMutacaoCumprimento(
  (v: { condicionanteId: string; dados: CancelamentoCumprimentoDados }) =>
    enviar<RespostaCumprimento>('POST', `/api/condicionantes/${v.condicionanteId}/cumprimentos/cancelar`, v.dados),
  'Cumprimento desfeito');

export const usePerfil = () => useQuery({
  queryKey: ['perfil'],
  queryFn: () => api<import('@/schemas/perfil').Perfil>('/api/perfil'),
  staleTime: 5 * 60_000,
});
export function useAtualizarPerfil() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (dados: import('@/schemas/perfil').AtualizarPerfil) => api<import('@/schemas/perfil').Perfil>('/api/perfil', { method: 'PATCH', json: dados }),
    onSuccess: (perfil) => {
      qc.setQueryData(['perfil'], perfil);
      qc.setQueryData<Sessao>(['sessao'], (anterior) => anterior && { ...anterior, nome: perfil.nome });
      toast.sucesso('Preferências salvas');
    },
    onError: (e: Error) => toast.erro(e.message),
  });
}
