'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MailPlus, Search, Send, ShieldCheck, UserRound, UserRoundX, Users } from 'lucide-react';
import { useToast } from '@/components/toast';
import { Paginacao } from '@/components/paginacao';
import { ApiError, api } from '@/hooks/useApi';
import { Badge, Button, Card, Campo, Confirmar, ErroCarga, inputCls, Modal, PageHeader, Skeleton, Vazio } from '@/components/ui';
import { ROTULO_PAPEL } from '@/lib/permissoes';
import { criarUsuarioSchema } from '@/schemas/autenticacao';
import type { Papel } from '@/types/solar';
import { contar } from '@/utils/texto';

type Usuario = { id: string; email: string; nome: string; papel: Papel; ativo: boolean; criadoEm: string };
type Alteracao = { usuario: Usuario; papel?: Papel; ativo?: boolean };
/** Como o servidor entrega convites: por e-mail (SMTP) ou só no terminal (desenvolvimento sem SMTP). */
type Entrega = 'email' | 'terminal';
const consultarEntrega = () => api<{ entrega: Entrega }>('/api/usuarios/convite').then((r) => r.entrega);
/** Nunca afirma "e-mail enviado" sem o servidor confirmar que existe SMTP; nunca mostra o link. */
function mensagemConvite(entrega: Entrega | null, email: string, inicio: string) {
  if (entrega === 'email') return `${inicio} O convite foi enviado por e-mail para ${email}.`;
  if (entrega === 'terminal') return `${inicio} Sem SMTP configurado, nenhum e-mail foi enviado: o link de ${email} está no terminal do servidor.`;
  return `${inicio} Não foi possível confirmar a forma de entrega do convite para ${email}.`;
}
const papeis: Papel[] = ['consulta', 'gestor', 'admin'];
const SEM_USUARIOS: Usuario[] = [];

export function UsuariosClient({ emailAtual }: { emailAtual: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const consulta = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/api/usuarios') });
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const porPagina = 12;
  const [mostrarCriacao, setMostrarCriacao] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('consulta');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [processando, setProcessando] = useState(false);
  const [alteracao, setAlteracao] = useState<Alteracao | null>(null);
  // E-mails cuja conta foi criada mas o convite não saiu. Só nesta tela: sem coluna no banco para isso.
  const [convitePendente, setConvitePendente] = useState<ReadonlySet<string>>(new Set());
  const [reenviando, setReenviando] = useState<string | null>(null);

  const lista = consulta.data ?? SEM_USUARIOS;
  const filtrados = useMemo(() => lista.filter((u) =>
    `${u.nome} ${u.email}`.toLowerCase().includes(busca.trim().toLowerCase())), [lista, busca]);
  const ativos = lista.filter((u) => u.ativo).length;
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filtrados.length / porPagina)));
  const visiveis = filtrados.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);
  const admins = lista.filter((u) => u.ativo && u.papel === 'admin').length;

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const validado = criarUsuarioSchema.safeParse({ nome, email, papel });
    if (!validado.success) {
      const campos: Record<string, string> = {};
      for (const questao of validado.error.issues) campos[String(questao.path[0])] ??= questao.message;
      setErros(campos);
      return;
    }
    setErros({});
    setProcessando(true);
    try {
      const novo = await api<Usuario>('/api/usuarios', { method: 'POST', json: validado.data });
      qc.setQueryData<Usuario[]>(['usuarios'], (antigos) => antigos ? [...antigos, novo] : antigos);
      void qc.invalidateQueries({ queryKey: ['usuarios'], refetchType: 'inactive' });
      // POST /api/usuarios não informa a entrega: pergunta ao servidor (sem enviar nada de novo).
      const entrega = await qc.fetchQuery({ queryKey: ['convite-entrega'], queryFn: consultarEntrega, staleTime: 60_000 }).catch(() => null);
      toast.sucesso(mensagemConvite(entrega, novo.email, 'Conta criada.'));
      setMostrarCriacao(false);
      setNome(''); setEmail(''); setPapel('consulta');
    } catch (e) {
      if (e instanceof ApiError && e.detalhes) setErros(e.detalhes);
      if (e instanceof ApiError && e.status === 503) {
        // A conta FOI criada; só o e-mail falhou. Não cadastrar de novo: reenviar pela lista.
        const criado = validado.data.email.toLowerCase();
        setConvitePendente((atual) => new Set(atual).add(criado));
        void qc.invalidateQueries({ queryKey: ['usuarios'] });
        setMostrarCriacao(false);
        setNome(''); setEmail(''); setPapel('consulta');
        toast.erro('A conta foi criada, mas o convite NÃO foi enviado. Use "Reenviar convite" na lista quando o e-mail voltar.');
      } else if (e instanceof ApiError && e.status === 409) {
        toast.erro('Já existe uma conta com esse e-mail. Se o convite não chegou, use "Reenviar convite" na lista.');
      } else {
        toast.erro(e instanceof Error ? e.message : 'Não foi possível cadastrar.');
      }
    } finally { setProcessando(false); }
  }

  async function reenviarConvite(u: Usuario) {
    setReenviando(u.id);
    try {
      const { entrega } = await api<{ ok: true; entrega: Entrega }>('/api/usuarios/convite', { method: 'POST', json: { id: u.id } });
      setConvitePendente((atual) => { const novo = new Set(atual); novo.delete(u.email.toLowerCase()); return novo; });
      toast.sucesso(mensagemConvite(entrega, u.email, 'Novo link de convite gerado.'));
    } catch (e) {
      // 503: nada foi enviado. 429: limite de envios. 409: conta desativada. Mensagens vêm do servidor.
      toast.erro(e instanceof Error ? e.message : 'Não foi possível reenviar o convite.');
    } finally { setReenviando(null); }
  }

  async function confirmarAlteracao() {
    if (!alteracao) return;
    setProcessando(true);
    try {
      const atualizado = await api<Usuario>('/api/usuarios', { method: 'PATCH', json: {
        id: alteracao.usuario.id, ...(alteracao.papel !== undefined ? { papel: alteracao.papel } : {}),
        ...(alteracao.ativo !== undefined ? { ativo: alteracao.ativo } : {}),
      } });
      qc.setQueryData<Usuario[]>(['usuarios'], (antigos) => antigos?.map((u) => u.id === atualizado.id ? { ...u, ...atualizado } : u));
      void qc.invalidateQueries({ queryKey: ['usuarios'], refetchType: 'inactive' });
      toast.sucesso('Usuário atualizado. Sessões antigas são revogadas quando necessário.');
      setAlteracao(null);
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Não foi possível atualizar o usuário.');
    } finally { setProcessando(false); }
  }

  return (
    <>
      <PageHeader titulo="Usuários e acessos" descricao="Cadastre pessoas, ajuste permissões e desative acessos sem compartilhar senhas."
        acoes={<Button variante="primario" onClick={() => setMostrarCriacao(true)}><MailPlus className="size-4" /> Convidar usuário</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4"><Users className="size-6 text-sky-600" /><div><p className="text-xs text-slate-500">Contas cadastradas</p><p className="text-2xl font-bold text-slate-900">{lista.length}</p></div></Card>
        <Card className="flex items-center gap-3 p-4"><CheckCircle2 className="size-6 text-emerald-600" /><div><p className="text-xs text-slate-500">Contas ativas</p><p className="text-2xl font-bold text-slate-900">{ativos}</p></div></Card>
        <Card className="flex items-center gap-3 p-4"><ShieldCheck className="size-6 text-amber-600" /><div><p className="text-xs text-slate-500">Administradores ativos</p><p className="text-2xl font-bold text-slate-900">{admins}</p></div></Card>
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-52 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
            <input aria-label="Pesquisar usuários" className={`${inputCls} pl-9`} placeholder="Pesquisar nome ou e-mail" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
          </div>
          <p className="text-sm text-slate-500">{contar(filtrados.length, 'resultado', 'resultados')}</p>
        </div>
        {consulta.isPending ? <div className="space-y-3 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div> :
          consulta.isError ? <ErroCarga onTentar={() => void consulta.refetch()} /> : filtrados.length === 0 ?
          <Vazio titulo="Nenhum usuário encontrado" texto={busca ? 'Tente outro nome ou e-mail.' : 'Convide a primeira pessoa para acessar o Solaria.'} /> :
          <div className="divide-y divide-slate-100">{visiveis.map((u) => {
            const proprio = u.email === emailAtual;
            return <div key={u.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800"><UserRound className="size-5" /></span>
                <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{u.nome} {proprio && <span className="font-normal text-slate-500">(você)</span>}</p>
                  <p className="truncate text-sm text-slate-500">{u.email}</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                {convitePendente.has(u.email.toLowerCase()) && <Badge cor="amarelo">Convite não enviado</Badge>}
                <Badge cor={u.ativo ? 'verde' : 'cinza'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                {u.ativo && !proprio && (
                  <Button disabled={processando || reenviando !== null} carregando={reenviando === u.id}
                    onClick={() => void reenviarConvite(u)} aria-label={`Reenviar convite para ${u.nome}`}>
                    <Send className="size-4" /> Reenviar convite
                  </Button>
                )}
                <label className="text-xs text-slate-600">Permissão
                  <select value={u.papel} disabled={processando || proprio} aria-label={`Permissão de ${u.nome}`}
                    className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50"
                    onChange={(e) => setAlteracao({ usuario: u, papel: e.target.value as Papel })}>
                    {papeis.map((p) => <option value={p} key={p}>{ROTULO_PAPEL[p]}</option>)}
                  </select>
                </label>
                <Button disabled={processando || proprio} onClick={() => setAlteracao({ usuario: u, ativo: !u.ativo })}
                  variante={u.ativo ? 'perigo' : 'secundario'}>
                  {u.ativo ? <UserRoundX className="size-4" /> : <CheckCircle2 className="size-4" />}
                  {u.ativo ? 'Desativar' : 'Reativar'}
                </Button>
              </div>
            </div>;
          })}</div>}
      </Card>
      <Paginacao pagina={paginaAtual} total={filtrados.length} porPagina={porPagina} aoMudar={setPagina} />
      <p className="mt-3 text-xs text-slate-500">Apenas administradores podem gerir contas. Ao alterar uma permissão ou desativar uma conta, sessões antigas são revogadas.</p>

      {mostrarCriacao && <Modal titulo="Convidar novo usuário" onFechar={() => !processando && setMostrarCriacao(false)}>
        <p className="mb-4 text-sm text-slate-600">A pessoa definirá sua própria senha pelo link enviado ao e-mail. Nenhuma senha é compartilhada.</p>
        <form className="space-y-4" onSubmit={criar}>
          <Campo id="novoNome" rotulo="Nome" erro={erros.nome}><input id="novoNome" autoFocus required className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo id="novoEmail" rotulo="E-mail" erro={erros.email}><input id="novoEmail" type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
          <Campo id="novoPapel" rotulo="Nível de acesso"><select id="novoPapel" className={inputCls} value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
            {papeis.map((p) => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
          </select></Campo>
          <p className="text-xs text-slate-500">Em desenvolvimento, sem SMTP, o convite aparece somente no terminal do servidor.</p>
          <div className="flex justify-end gap-2"><Button disabled={processando} onClick={() => setMostrarCriacao(false)}>Cancelar</Button>
            <Button type="submit" variante="primario" carregando={processando}>Criar e convidar</Button></div>
        </form>
      </Modal>}
      {alteracao && <Confirmar titulo="Confirmar alteração" rotulo="Confirmar" perigo={alteracao.ativo === false}
        carregando={processando} onFechar={() => !processando && setAlteracao(null)} onConfirmar={() => void confirmarAlteracao()}
        mensagem={alteracao.papel ? `Alterar a permissão de ${alteracao.usuario.nome} para ${ROTULO_PAPEL[alteracao.papel]}?` :
          `${alteracao.ativo ? 'Reativar' : 'Desativar'} a conta de ${alteracao.usuario.nome}?`} />}
    </>
  );
}
