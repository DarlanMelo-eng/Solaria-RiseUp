/**
 * Dados de exemplo + primeira conta admin. Rode com `npm run db:seed`.
 * Idempotente: não apaga nada e não troca a senha de um admin que já existe.
 */
import { loadEnvConfig } from '@next/env';
import { z } from 'zod';
loadEnvConfig(process.cwd());

async function main() {
  // Imports dinâmicos: o .env precisa estar carregado antes de o pool do banco ser criado.
  const { banco, pool } = await import('./index');
  const { usinas, licencas, manutencoes, usuarios, atividades } = await import('./schema');
  const { gerarHashSenha } = await import('../senhas');
  const { senhaSchema, senhaIgualEmail } = await import('../../schemas/autenticacao');
  const { hojeServidor } = await import('../fuso');
  const ambiente = z.object({
    SEED_ADMIN_EMAIL: z.email(), SEED_ADMIN_NOME: z.string().trim().min(2),
    SEED_ADMIN_SENHA: senhaSchema,
  }).safeParse(process.env);
  if (!ambiente.success) throw new Error('Defina SEED_ADMIN_EMAIL, SEED_ADMIN_NOME e SEED_ADMIN_SENHA (mínimo 10 caracteres e não comum).');
  const { SEED_ADMIN_EMAIL: bruto, SEED_ADMIN_NOME: nome, SEED_ADMIN_SENHA: senha } = ambiente.data;
  const email = bruto.toLowerCase();
  if (senhaIgualEmail(senha, email)) throw new Error('SEED_ADMIN_SENHA não pode ser igual ao e-mail.');
  const adminHash = await gerarHashSenha(senha);
  const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  const daqui = (dias: number) => hojeServidor(new Date(Date.now() + dias * 86400000));
  const u = [
    { id: id(1), nome: 'Solaria Petrolina I', localizacao: 'Petrolina, PE', capacidadeKwp: 30000, status: 'ativa' as const },
    { id: id(2), nome: 'Solaria Juazeiro', localizacao: 'Juazeiro, BA', capacidadeKwp: 12500, status: 'ativa' as const },
    { id: id(3), nome: 'Solaria Mossoró', localizacao: 'Mossoró, RN', capacidadeKwp: 8000, status: 'inativa' as const },
    { id: id(4), nome: 'Solaria Lapa', localizacao: 'Bom Jesus da Lapa, BA', capacidadeKwp: 2400, status: 'ativa' as const },
  ];
  const l = [
    { id: id(101), usinaId: u[0].id, tipo: 'Parecer de Acesso', emissor: 'Neoenergia', numero: 'PA-2024-0187', dataValidade: daqui(120) },
    { id: id(102), usinaId: u[0].id, tipo: 'Licença de Operação Ambiental', emissor: 'CPRH', numero: 'LO-1182/2023', dataValidade: daqui(12) },
    { id: id(103), usinaId: u[0].id, tipo: 'Outorga ANEEL', emissor: 'ANEEL', numero: 'Res. 3.451', dataValidade: daqui(400) },
    { id: id(104), usinaId: u[1].id, tipo: 'Licença de Operação Ambiental', emissor: 'INEMA', numero: 'LO-77/2022', dataValidade: daqui(-9) },
    { id: id(105), usinaId: u[1].id, tipo: 'Parecer de Acesso', emissor: 'Coelba', numero: 'PA-2025-0412', dataValidade: daqui(45) },
    { id: id(106), usinaId: u[3].id, tipo: 'Outorga ANEEL', emissor: 'ANEEL', numero: 'Res. 4.102', dataValidade: daqui(200) },
    { id: id(107), usinaId: u[2].id, tipo: 'Licença de Operação Ambiental', emissor: 'IDEMA', numero: 'LO-310/2021', dataValidade: daqui(60) },
  ];
  const m = [
    { id: id(201), usinaId: u[0].id, titulo: 'Limpeza dos painéis', responsavel: 'Equipe Norte', prazo: daqui(5), prioridade: 'media' as const, status: 'pendente' as const },
    { id: id(202), usinaId: u[0].id, titulo: 'Inspeção de inversores', responsavel: 'Carlos Mendes', prazo: daqui(2), prioridade: 'alta' as const, status: 'em_andamento' as const },
    { id: id(203), usinaId: u[1].id, titulo: 'Laudo de aterramento', responsavel: 'Fernanda Lima', prazo: daqui(-3), prioridade: 'alta' as const, status: 'pendente' as const },
    { id: id(204), usinaId: u[1].id, titulo: 'Limpeza dos painéis', responsavel: 'Equipe Sul', prazo: daqui(-10), prioridade: 'baixa' as const, status: 'concluida' as const, concluidaEm: daqui(-11) },
    { id: id(205), usinaId: u[3].id, titulo: 'Inspeção de inversores', responsavel: 'Carlos Mendes', prazo: daqui(25), prioridade: 'media' as const, status: 'pendente' as const },
    { id: id(206), usinaId: u[2].id, titulo: 'Laudo de aterramento', responsavel: 'Fernanda Lima', prazo: daqui(30), prioridade: 'baixa' as const, status: 'pendente' as const },
  ];
  try {
    await banco.transaction(async (tx) => {
      await tx.insert(usuarios).values({ email, nome, papel: 'admin', senhaHash: adminHash }).onConflictDoNothing();
      await tx.insert(usinas).values(u).onConflictDoNothing();
      await tx.insert(licencas).values(l).onConflictDoNothing();
      await tx.insert(manutencoes).values(m).onConflictDoNothing();
      await tx.insert(atividades).values({ id: id(301), usuario: 'Sistema', descricao: 'Dados iniciais carregados' }).onConflictDoNothing();
    });
    console.info('Seed concluído. Dados existentes e credenciais de contas pré-existentes preservados.');
  } finally { await pool.end(); }
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : 'Falha no seed'); process.exitCode = 1; });
