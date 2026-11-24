export type StatusUsina = 'ativa' | 'inativa';
export type StatusLicenca = 'valida' | 'proximo_vencimento' | 'expirada';
export type StatusManutencao = 'pendente' | 'em_andamento' | 'concluida';
export type Prioridade = 'baixa' | 'media' | 'alta';
export type Papel = 'admin' | 'gestor' | 'consulta';

export interface Usina {
  id: string;
  nome: string;
  localizacao: string;
  capacidadeKwp: number;
  status: StatusUsina;
}

export interface Licenca {
  id: string;
  usinaId: string;
  tipo: string;
  emissor: string;
  numero: string;
  dataValidade: string; // AAAA-MM-DD
  observacao?: string;
}

export interface Manutencao {
  id: string;
  usinaId: string;
  titulo: string;
  responsavel: string;
  prazo: string; // AAAA-MM-DD
  prioridade: Prioridade;
  status: StatusManutencao;
  concluidaEm?: string;
}

export type CategoriaCondicionante = 'monitoramento' | 'relatorio' | 'compensacao' | 'operacional' | 'outro';
export type PeriodicidadeCondicionante = 'unica' | 'mensal' | 'trimestral' | 'semestral' | 'anual';
export type StatusCondicionante = 'pendente' | 'em_andamento' | 'cumprida' | 'encerrada';

/** Condicionante de uma licença ambiental (a usina vem da licença). */
export interface Condicionante {
  id: string;
  licencaId: string;
  codigo: string;
  descricao: string;
  categoria: CategoriaCondicionante;
  responsavel: string;
  periodicidade: PeriodicidadeCondicionante;
  prazoInicial: string; // AAAA-MM-DD, âncora do calendário atual
  prazo: string; // AAAA-MM-DD, próximo vencimento
  calendario: number;
  ciclo: number;
  status: StatusCondicionante;
  ultimoCumprimentoEm?: string;
  observacao?: string;
  criadoEm: string; // ISO
  atualizadoEm: string; // ISO
}

/** Um período cumprido. Cancelar não apaga: preenche os campos de cancelamento. */
export interface CumprimentoCondicionante {
  id: string;
  condicionanteId: string;
  calendario: number;
  ciclo: number;
  prazoReferencia: string; // AAAA-MM-DD, vencimento do período
  cumpridaEm: string; // AAAA-MM-DD
  observacao?: string;
  registradoPor: string;
  registradoPorNome: string;
  registradoEm: string; // ISO
  canceladoEm?: string; // ISO
  canceladoPor?: string;
  canceladoPorNome?: string;
  motivoCancelamento?: string;
}

export interface Atividade {
  id: string;
  em: string; // ISO
  usuario: string;
  descricao: string;
}

export interface Sessao {
  email: string;
  nome: string;
  papel: Papel;
}

/** Tudo o que as telas operacionais usam, entregue por GET /api/dados. */
export interface DadosOperacionais {
  usinas: Usina[];
  licencas: Licenca[];
  manutencoes: Manutencao[];
  condicionantes: Condicionante[];
}
