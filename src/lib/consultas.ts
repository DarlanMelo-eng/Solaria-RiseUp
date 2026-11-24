import { asc, eq } from 'drizzle-orm';
import { banco, pool } from '@/lib/db';
import { condicionantes, licencas, manutencoes, preferenciasUsuario, usinas, usuarios } from '@/lib/db/schema';
import { codigoPostgres } from '@/lib/db/erros';
import { formatarCondicionante, formatarLicenca, formatarManutencao, formatarUsina } from '@/lib/db/formatar';
import { PERFIL_PADRAO, type CorAvatar, type MenuModo, type Perfil, type Tema } from '@/schemas/perfil';
import type { DadosOperacionais } from '@/types/solar';

/**
 * Consultas de leitura usadas tanto pelas rotas /api quanto pelo layout no servidor.
 * Um único lugar evita que a API e a primeira renderização devolvam formatos diferentes.
 */
/**
 * COMPATIBILIDADE TEMPORÁRIA (Lote 11): enquanto a migração 0002 não estiver aplicada em um banco,
 * a tabela `condicionantes` não existe nele e a lista volta vazia, sem derrubar o /api/dados nem o layout.
 * Só o erro 42P01 (tabela inexistente) é tolerado, e só depois de o catálogo confirmar que é mesmo
 * `condicionantes` que falta. A conferência não lê a mensagem do erro, que muda com o idioma do
 * PostgreSQL. Conexão, permissão ou qualquer outra falha continuam sendo erro.
 * Remover quando a 0002 estiver aplicada em todos os bancos.
 */
let avisouFaltaCondicionantes = false;
async function listarCondicionantes() {
  try {
    const linhas = await banco.select().from(condicionantes).orderBy(asc(condicionantes.prazo), asc(condicionantes.codigo));
    return linhas.map(formatarCondicionante);
  } catch (e) {
    if (codigoPostgres(e) !== '42P01') throw e;
    // to_regclass resolve o nome pelo mesmo search_path da consulta; null = a tabela não existe.
    const { rows } = await pool.query<{ falta: boolean }>("SELECT to_regclass('condicionantes') IS NULL AS falta");
    if (!rows[0]?.falta) throw e;
    if (!avisouFaltaCondicionantes) {
      avisouFaltaCondicionantes = true;
      console.warn('[solaria] A tabela "condicionantes" não existe neste banco (migração 0002 pendente): /api/dados devolve condicionantes vazias.');
    }
    return [];
  }
}

export async function buscarDados(): Promise<DadosOperacionais> {
  const [listaUsinas, listaLicencas, listaManutencoes, listaCondicionantes] = await Promise.all([
    banco.select().from(usinas),
    banco.select().from(licencas),
    banco.select().from(manutencoes),
    // Só a condicionante, sem o histórico de cumprimentos: ele é carregado sob demanda.
    listarCondicionantes(),
  ]);
  return {
    usinas: listaUsinas.map(formatarUsina),
    licencas: listaLicencas.map(formatarLicenca),
    manutencoes: listaManutencoes.map(formatarManutencao),
    condicionantes: listaCondicionantes,
  };
}

export async function buscarPerfil(usuarioId: string): Promise<Perfil | null> {
  const [linha] = await banco.select({
    email: usuarios.email, nome: usuarios.nome, papel: usuarios.papel,
    tema: preferenciasUsuario.tema, menuModo: preferenciasUsuario.menuModo,
    menuFixado: preferenciasUsuario.menuFixado, avatarCor: preferenciasUsuario.avatarCor,
  }).from(usuarios)
    .leftJoin(preferenciasUsuario, eq(preferenciasUsuario.usuarioId, usuarios.id))
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  if (!linha) return null;
  return {
    email: linha.email,
    nome: linha.nome,
    papel: linha.papel,
    tema: (linha.tema ?? PERFIL_PADRAO.tema) as Tema,
    menuModo: (linha.menuModo ?? PERFIL_PADRAO.menuModo) as MenuModo,
    menuFixado: linha.menuFixado ?? PERFIL_PADRAO.menuFixado,
    avatarCor: (linha.avatarCor ?? PERFIL_PADRAO.avatarCor) as CorAvatar,
  };
}
