'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronLeft, ChevronRight, ClipboardCheck, LayoutDashboard, LogOut, Menu, Moon, Pin, PinOff, RefreshCw, ShieldCheck, Sun, UserRound, Users, Wrench, X } from 'lucide-react';
import { useAtualizarPerfil, useDados, usePerfil } from '@/hooks/useApi';
import { ROTULO_PAPEL } from '@/lib/permissoes';
import { PERFIL_PADRAO, type MenuModo, type Tema } from '@/schemas/perfil';
import { COR_AVATAR, iniciais } from '@/lib/avatar';
import { montarAlertas } from '@/utils/datas';
import { Marca } from './marca';
import { useToast } from './toast';
import { cx, TelaCarregando } from './ui';

const NAV = [
  { href: '/dashboard', rotulo: 'Dashboard', Icone: LayoutDashboard },
  { href: '/usinas', rotulo: 'Usinas', Icone: Sun },
  { href: '/licencas', rotulo: 'Licenças', Icone: ShieldCheck },
  { href: '/condicionantes', rotulo: 'Condicionantes', Icone: ClipboardCheck },
  { href: '/manutencoes', rotulo: 'Manutenções', Icone: Wrench },
  { href: '/alertas', rotulo: 'Alertas', Icone: Bell },
  { href: '/perfil', rotulo: 'Meu perfil', Icone: UserRound },
  { href: '/usuarios', rotulo: 'Usuários', Icone: Users },
];

function useAlertas() {
  const { usinas, licencas, manutencoes } = useDados();
  return useMemo(() => montarAlertas(usinas, licencas, manutencoes), [usinas, licencas, manutencoes]);
}

function Navegacao({ compacta, papel, aoNavegar }: { compacta: boolean; papel?: string; aoNavegar?: () => void }) {
  const pathname = usePathname();
  const total = useAlertas().length;
  return (
    <nav aria-label="Principal" className="flex-1 space-y-1 px-2.5">
      {NAV.filter((item) => item.href !== '/usuarios' || papel === 'admin').map(({ href, rotulo, Icone }) => {
        const ativo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} onClick={aoNavegar} title={compacta ? rotulo : undefined} aria-label={compacta ? rotulo : undefined} aria-current={ativo ? 'page' : undefined}
            className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', ativo ? 'bg-sol-400 text-marca-950 shadow-sm' : 'text-marca-200/85 hover:bg-white/8 hover:text-white')}>
            <Icone className="size-5 shrink-0" aria-hidden />
            {!compacta && <span className="min-w-0 truncate">{rotulo}</span>}
            {!compacta && href === '/alertas' && total > 0 && <span className={cx('ml-auto rounded-full px-2 py-0.5 text-xs font-bold', ativo ? 'bg-marca-950 text-sol-400' : 'bg-red-500 text-white')}>{total}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function MarcaMenu({ compacta }: { compacta: boolean }) {
  return (
    <Link href="/dashboard" title="Voltar ao dashboard" aria-label="Solaria — voltar ao dashboard"
      className={cx('flex min-h-18 items-center px-5 py-5', compacta && 'justify-center px-2')}>
      <Marca tom="claro" compacta={compacta} />
    </Link>
  );
}

function Sino() {
  const alertas = useAlertas();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label={`Alertas (${alertas.length})`}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
        <Bell className="size-5" />
        {alertas.length > 0 && <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{alertas.length > 9 ? '9+' : alertas.length}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {alertas.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">Tudo em dia. Nenhum alerta.</p> :
            <ul>{alertas.slice(0, 5).map((a) => <li key={a.id}>
              <Link href={a.href} onClick={() => setAberto(false)} className="flex gap-3 rounded-lg p-2.5 hover:bg-slate-50">
                <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', a.gravidade === 'critica' ? 'bg-red-500' : 'bg-amber-400')} aria-hidden />
                <span className="text-sm"><span className="block font-medium text-slate-900">{a.titulo}</span><span className="text-xs text-slate-500">{a.detalhe}</span></span>
              </Link>
            </li>)}</ul>}
          <Link href="/alertas" onClick={() => setAberto(false)} className="mt-1 block rounded-lg border-t border-slate-100 p-2.5 text-center text-sm font-semibold text-amber-700 hover:bg-slate-50">Ver todos os alertas</Link>
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: perfil } = usePerfil();
  const { recarregar, atualizando } = useDados();
  const atualizar = useAtualizarPerfil();
  const [menuAberto, setMenuAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [sistemaEscuro, setSistemaEscuro] = useState(false);
  const [temporario, setTemporario] = useState<{ tema?: Tema; menuModo?: MenuModo; menuFixado?: boolean }>({});
  const tema = temporario.tema ?? perfil?.tema ?? PERFIL_PADRAO.tema;
  const menuModo = temporario.menuModo ?? perfil?.menuModo ?? PERFIL_PADRAO.menuModo;
  const menuFixado = temporario.menuFixado ?? perfil?.menuFixado ?? PERFIL_PADRAO.menuFixado;
  const escuro = tema === 'escuro' || (tema === 'sistema' && sistemaEscuro);
  const compacto = menuModo === 'recolhido';
  const avatarCor = perfil?.avatarCor ?? PERFIL_PADRAO.avatarCor;

  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const atualizarSistema = () => setSistemaEscuro(m.matches);
    atualizarSistema();
    m.addEventListener('change', atualizarSistema);
    return () => m.removeEventListener('change', atualizarSistema);
  }, []);
  useEffect(() => {
    if (!menuAberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAberto(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [menuAberto]);

  function salvarPreferencia(dados: { tema?: Tema; menuModo?: MenuModo; menuFixado?: boolean }) {
    setTemporario((p) => ({ ...p, ...dados }));
    atualizar.mutate(dados, { onSettled: () => setTemporario({}) });
  }
  async function sair() {
    setSaindo(true);
    try {
      // fetch direto (sem api()): um 401 aqui não deve disparar o redirecionamento global de sessão expirada.
      const res = await fetch('/api/auth/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      });
      // 401 vem do proxy quando já não havia sessão válida: a pessoa já está fora.
      if (!res.ok && res.status !== 401) throw new Error(`Logout recusado (${res.status})`);
    } catch {
      // Sem confirmação do servidor o cookie pode continuar ativo: avisar e manter a pessoa onde está.
      toast.erro('Não foi possível sair. Verifique sua conexão e tente novamente.');
      setSaindo(false);
      return;
    }
    qc.clear();
    // Recarga completa: descarta todo o estado em memória (cache de dados, páginas já visitadas).
    window.location.replace('/login');
  }

  const painel = (compacta: boolean, fechar?: () => void) => (
    <>
      <MarcaMenu compacta={compacta} />
      <Navegacao compacta={compacta} papel={perfil?.papel} aoNavegar={fechar} />
      <div className="mb-4 flex items-center justify-center gap-1 px-2">
        <button type="button" disabled={atualizar.isPending} onClick={() => salvarPreferencia({ menuModo: compacta ? 'expandido' : 'recolhido' })}
          className="rounded-lg p-2 text-marca-200/80 hover:bg-white/8 hover:text-white" aria-label={compacta ? 'Expandir barra lateral' : 'Recolher barra lateral'} title={compacta ? 'Expandir' : 'Recolher'}>
          {compacta ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-5" />}
        </button>
        <button type="button" disabled={atualizar.isPending} onClick={() => { salvarPreferencia({ menuFixado: !menuFixado }); setMenuAberto(false); }}
          className="rounded-lg p-2 text-marca-200/80 hover:bg-white/8 hover:text-white" aria-label={menuFixado ? 'Desfixar barra lateral' : 'Fixar barra lateral'} title={menuFixado ? 'Desfixar' : 'Fixar'}>
          {menuFixado ? <PinOff className="size-5" /> : <Pin className="size-5" />}
        </button>
      </div>
    </>
  );

  return (
    <div className={cx('app-interface min-h-screen transition-colors', escuro ? 'tema-escuro' : 'tema-claro')}>
      {menuFixado && <aside className={cx('menu-lateral fixed inset-y-0 left-0 z-40 hidden flex-col transition-[width] duration-200 md:flex', compacto ? 'w-[76px]' : 'w-64')}>
        {painel(compacto)}
      </aside>}

      {menuAberto && <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu lateral">
        <button type="button" className="absolute inset-0 w-full bg-slate-950/65" aria-label="Fechar menu lateral" onClick={() => setMenuAberto(false)} />
        <aside className="menu-lateral relative flex h-full w-72 max-w-[85vw] flex-col">
          <button onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="absolute right-1 top-1 z-10 rounded-lg p-2 text-slate-300 hover:bg-white/10"><X className="size-4" /></button>
          {painel(false, () => setMenuAberto(false))}
        </aside>
      </div>}

      <div className={cx('min-h-screen transition-[margin] duration-200', menuFixado && (compacto ? 'md:ml-[76px]' : 'md:ml-64'))}>
        <header className="app-topbar sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
          <button onClick={() => setMenuAberto(true)} aria-label="Abrir menu lateral" title="Abrir menu" className={cx('rounded-lg p-2 text-slate-600 hover:bg-slate-100', menuFixado && 'md:hidden')}><Menu className="size-5" /></button>
          {!menuFixado && <span className="hidden text-sm font-bold text-slate-700 sm:inline">Solaria Management</span>}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button type="button" onClick={recarregar} disabled={atualizando} aria-label="Atualizar dados" title="Atualizar os registros"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              <RefreshCw className={cx('size-5', atualizando && 'animate-spin')} aria-hidden />
            </button>
            <button type="button" disabled={atualizar.isPending} onClick={() => salvarPreferencia({ tema: escuro ? 'claro' : 'escuro' })} aria-label={escuro ? 'Ativar modo claro' : 'Ativar modo escuro'} title={escuro ? 'Modo claro' : 'Modo escuro'} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
              {escuro ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <Sino />
            <Link href="/perfil" className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100" title="Editar meu perfil">
              <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold', COR_AVATAR[avatarCor])}>{iniciais(perfil?.nome ?? 'Solaria')}</span>
              {perfil && <span className="hidden text-right leading-tight sm:block"><span className="block text-sm font-semibold text-slate-900">{perfil.nome}</span><span className="block text-xs text-slate-500">{ROTULO_PAPEL[perfil.papel]}</span></span>}
            </Link>
            <button onClick={sair} disabled={saindo} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50" aria-label="Sair do sistema">
              <LogOut className="size-4" aria-hidden /><span className="hidden lg:inline">Sair</span>
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-8">
          <Suspense fallback={<TelaCarregando />}>{children}</Suspense>
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-slate-400">Solaria Management · Seus dados, sua gestão</footer>
      </div>
    </div>
  );
}
