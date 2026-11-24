import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { COOKIE_SESSAO, lerSessao } from '@/lib/sessao';
import { verificarUsuarioSessao } from '@/lib/usuarios';
import { UsuariosClient } from './usuarios-client';

export default async function PaginaUsuarios() {
  const sessao = await lerSessao((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!sessao) redirect('/login');
  const atual = await verificarUsuarioSessao(sessao);
  if (!atual) redirect('/login');
  if (atual.papel !== 'admin') notFound();
  return <UsuariosClient emailAtual={atual.email} />;
}
