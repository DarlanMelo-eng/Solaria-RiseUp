import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { Shell } from '@/components/shell';
import { buscarDados, buscarPerfil } from '@/lib/consultas';
import { COOKIE_SESSAO, lerSessao } from '@/lib/sessao';
import { verificarUsuarioSessao } from '@/lib/usuarios';
import type { Sessao } from '@/types/solar';

/**
 * Confere a sessão e já busca no servidor o que toda tela usa (perfil e dados).
 * O navegador recebe tudo junto com o HTML: sem esperar 3 requisições depois de carregar,
 * sem "piscar" o tema e sem a barra lateral mudar de tamanho depois de aparecer.
 * O layout não roda de novo ao trocar de página, então isso só acontece na primeira carga.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const lida = await lerSessao(token);
  if (!lida) redirect('/login');
  const sessao = await verificarUsuarioSessao(lida);
  // Assinatura válida, mas o banco recusou a sessão (senha trocada, conta desativada).
  // Ir direto para /login criaria um laço: o proxy, vendo um cookie assinado, mandaria de volta
  // para cá. A rota /sessao-expirada apaga o cookie antes de levar ao login.
  if (!sessao) redirect('/sessao-expirada');

  const [perfil, dados] = await Promise.all([buscarPerfil(sessao.sub), buscarDados()]);
  const qc = new QueryClient();
  qc.setQueryData<Sessao>(['sessao'], { email: sessao.email, nome: sessao.nome, papel: sessao.papel });
  if (perfil) qc.setQueryData(['perfil'], perfil);
  qc.setQueryData(['dados'], dados);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Shell>{children}</Shell>
    </HydrationBoundary>
  );
}
