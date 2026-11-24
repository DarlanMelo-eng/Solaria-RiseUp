import Link from 'next/link';
import { BellRing, ShieldCheck, Wrench } from 'lucide-react';
import { Marca } from './marca';

const DESTAQUES = [
  { Icone: ShieldCheck, titulo: 'Licenças sempre em dia', texto: 'Aviso antes de cada vencimento, por usina.' },
  { Icone: Wrench, titulo: 'Manutenções no prazo', texto: 'Prioridade, responsável e andamento num quadro só.' },
  { Icone: BellRing, titulo: 'Alertas na hora certa', texto: 'O que precisa de ação aparece primeiro.' },
];

/**
 * Lado direito das telas de acesso: o nascer do sol do Solaria.
 * Só usa transform e opacity nas animações (baratas para o navegador) e some em telas pequenas.
 */
function PainelSolar() {
  return (
    <aside className="auth-painel relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center" aria-hidden>
      <div className="auth-ceu" />
      <div className="auth-sol" />
      <svg className="auth-ondas" viewBox="0 0 800 160" preserveAspectRatio="none">
        <path className="auth-onda-sol" d="M0 80 C 100 -10, 200 170, 300 80 S 500 -10, 600 80 S 750 150, 800 80" />
        <path className="auth-onda-luz" d="M0 80 C 100 170, 200 -10, 300 80 S 500 170, 600 80 S 750 10, 800 80" />
      </svg>
      <div className="auth-horizonte" />

      <div className="relative z-10 mx-auto w-full max-w-lg px-12 pt-40">
        <p className="auth-entrar text-xs font-bold uppercase tracking-[0.18em] text-marca-300">Gestão de usinas solares</p>
        <h2 className="auth-entrar mt-3 text-4xl font-bold leading-tight tracking-tight text-white" style={{ '--i': 1 } as React.CSSProperties}>
          Suas usinas, licenças e manutenções <span className="text-sol-400">em um só lugar.</span>
        </h2>
        <ul className="mt-9 space-y-5">
          {DESTAQUES.map(({ Icone, titulo, texto }, i) => (
            <li key={titulo} className="auth-entrar flex items-start gap-4" style={{ '--i': i + 2 } as React.CSSProperties}>
              <span className="rounded-xl bg-white/8 p-2.5 text-sol-400 ring-1 ring-white/10"><Icone className="size-5" /></span>
              <span>
                <span className="block font-semibold text-white">{titulo}</span>
                <span className="text-sm text-marca-200/80">{texto}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** Estrutura comum de login, recuperação e redefinição de senha. */
export function TelaAcesso({ children, rodape }: { children: React.ReactNode; rodape?: React.ReactNode }) {
  return (
    <main className="tela-acesso grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="flex min-w-0 flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="self-start rounded-lg" aria-label="Solaria Management — página inicial"><Marca /></Link>
        <div className="auth-formulario mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <div className="text-center text-xs text-slate-400">{rodape ?? 'Solaria Management · acesso restrito à equipe'}</div>
      </section>
      <PainelSolar />
    </main>
  );
}

export function AuthLayout({ titulo, descricao, children }: { titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <TelaAcesso>
      <h1 className="text-2xl font-bold tracking-tight text-marca-950">{titulo}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{descricao}</p>
      {children}
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="font-semibold text-marca-700 hover:underline">Voltar para entrar</Link>
      </p>
    </TelaAcesso>
  );
}
