import type { Metadata } from 'next';
import Link from 'next/link';
import { Marca } from '@/components/marca';
import {
  Activity,
  ArrowRight,
  BellRing,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  FileCheck2,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  SunMedium,
  Wrench,
  Zap,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Gestão solar com clareza',
  description:
    'Conheça o Solaria Management: organize usinas solares, licenças, manutenções e alertas em um único lugar.',
};

const recursos = [
  {
    titulo: 'Usinas sob controle',
    descricao: 'Centralize as informações de cada usina e acompanhe sua situação sem depender de planilhas espalhadas.',
    Icone: Zap,
    classe: 'landing-icone-ciano',
  },
  {
    titulo: 'Licenças organizadas',
    descricao: 'Acompanhe documentos e datas de validade para identificar o que precisa de atenção.',
    Icone: FileCheck2,
    classe: 'landing-icone-ambar',
  },
  {
    titulo: 'Manutenções em dia',
    descricao: 'Organize tarefas por prazo, prioridade, responsável e andamento.',
    Icone: Wrench,
    classe: 'landing-icone-verde',
  },
  {
    titulo: 'Alertas relevantes',
    descricao: 'Tenha uma visão das pendências de licenças e manutenções antes de abrir cada cadastro.',
    Icone: BellRing,
    classe: 'landing-icone-ambar',
  },
  {
    titulo: 'Visão operacional',
    descricao: 'Consulte indicadores, capacidade cadastrada e um histórico recente das atividades.',
    Icone: Activity,
    classe: 'landing-icone-ciano',
  },
  {
    titulo: 'Acesso por função',
    descricao: 'Controle o que administradores, gestores e usuários de consulta podem fazer.',
    Icone: ShieldCheck,
    classe: 'landing-icone-verde',
  },
];

function MarcaInicio() {
  return (
    <Link href="/" className="rounded-lg" aria-label="Solaria Management — página inicial">
      <Marca tom="claro" />
    </Link>
  );
}

function PreviaPlataforma() {
  return (
    <div className="landing-previa relative mx-auto w-full max-w-[580px]" aria-label="Prévia ilustrativa da plataforma Solaria">
      <div className="landing-amanhecer" aria-hidden="true">
        <span className="landing-amanhecer-halo" />
        <span className="landing-amanhecer-sol" />
        <span className="landing-amanhecer-horizonte" />
      </div>
      <div className="landing-painel relative z-10 overflow-hidden rounded-[24px] border border-white/15 shadow-[0_34px_90px_rgba(0,0,0,0.38)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#f9b74e] text-[#03222a]"><SunMedium className="size-5" /></span>
            <div>
              <p className="text-xs font-bold text-white">Painel de operação</p>
              <p className="text-[10px] text-[#8dabb0]">Prévia ilustrativa</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4ec7af]/25 bg-[#4ec7af]/10 px-2.5 py-1 text-[10px] font-semibold text-[#9aead4]">
            <span className="size-1.5 rounded-full bg-[#5cd4af]" />
            Visão geral
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3 sm:gap-3 sm:p-5">
          {[
            { titulo: 'Usinas', numero: '04', Icone: Zap },
            { titulo: 'Licenças', numero: '07', Icone: FileCheck2 },
            { titulo: 'Tarefas', numero: '03', Icone: CalendarClock },
          ].map(({ titulo, numero, Icone }) => (
            <div key={titulo} className="rounded-xl border border-white/10 bg-[#123842]/80 p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1 text-[#94b5b8]">
                <span className="text-[10px] sm:text-xs">{titulo}</span>
                <Icone className="size-3.5 text-[#6dcad3]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{numero}</p>
            </div>
          ))}
          <div className="col-span-3 rounded-xl border border-white/10 bg-[#123842]/80 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white">Organização por situação</p>
              <span className="text-[10px] text-[#86b4b8]">Exemplo</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="w-[62%] rounded-l-full bg-[#54ccac]" />
              <div className="w-[25%] bg-[#f4b54b]" />
              <div className="w-[13%] rounded-r-full bg-[#df7865]" />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#b1c9cb]">
              <span><i className="mr-1.5 inline-block size-1.5 rounded-full bg-[#54ccac]" />Em dia</span>
              <span><i className="mr-1.5 inline-block size-1.5 rounded-full bg-[#f4b54b]" />Atenção</span>
              <span><i className="mr-1.5 inline-block size-1.5 rounded-full bg-[#df7865]" />Pendente</span>
            </div>
          </div>
          <div className="col-span-3 space-y-2 rounded-xl border border-white/10 bg-[#123842]/80 p-3 sm:p-4">
            <p className="pb-1 text-xs font-semibold text-white">Próximas ações</p>
            <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.045] p-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f4b54b]/15 text-[#f4b54b]"><CalendarClock className="size-4" /></span>
              <span className="min-w-0 flex-1 text-[11px] text-[#e1eceb]">Revisar prazos de manutenção</span>
              <ChevronRight className="size-3.5 text-[#7ba0a5]" />
            </div>
            <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.045] p-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#54ccac]/15 text-[#54ccac]"><FileCheck2 className="size-4" /></span>
              <span className="min-w-0 flex-1 text-[11px] text-[#e1eceb]">Conferir validade de licenças</span>
              <ChevronRight className="size-3.5 text-[#7ba0a5]" />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-[#7fa7ac]">Os dados exibidos são apenas ilustrativos.</p>
    </div>
  );
}

export default function PaginaInicial() {
  return (
    <div className="landing-page min-h-screen overflow-hidden">
      <header className="landing-cabecalho relative z-20 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <MarcaInicio />
          <nav aria-label="Navegação da página inicial" className="hidden items-center gap-8 text-sm font-medium text-[#aac4c4] md:flex">
            <a href="#recursos" className="transition hover:text-white">Recursos</a>
            <a href="#como-funciona" className="transition hover:text-white">Como funciona</a>
            <a href="#seguranca" className="transition hover:text-white">Segurança</a>
          </nav>
          <Link href="/login" className="landing-botao-primario inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold sm:px-5 sm:text-sm">
            Acessar plataforma <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        <section className="landing-hero relative" aria-labelledby="titulo-principal">
          <div className="landing-luz-hero pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 lg:min-h-[720px] lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="relative z-10 max-w-2xl">
              <div className="landing-etiqueta mb-7 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] sm:text-xs">
                <span className="size-1.5 rounded-full bg-[#56d4c2]" />
                Gestão inteligente para energia solar
              </div>
              <h1 id="titulo-principal" className="landing-titulo max-w-[680px] text-[clamp(3rem,6.3vw,5.9rem)] font-black leading-[1.03] tracking-[-0.07em] text-[#f6f5ec]">
                Menos caos.<br />
                Mais <span className="landing-texto-gradiente">energia</span><br />
                para crescer.
              </h1>
              <p className="mt-7 max-w-[520px] text-base leading-relaxed text-[#aac4c4] sm:text-lg">
                Acompanhe usinas, licenças, manutenções e pendências em um só lugar. Uma plataforma feita para sua equipe encontrar o que importa sem complicação.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/login" className="landing-botao-primario inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-bold">
                  Entrar no Solaria <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <a href="#recursos" className="landing-botao-secundario inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold">
                  Explorar recursos <ChevronRight className="size-4" aria-hidden="true" />
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#95b6b7] sm:text-sm">
                <span className="inline-flex items-center gap-2"><CircleCheck className="size-4 text-[#67d9bc]" /> Informações centralizadas</span>
                <span className="inline-flex items-center gap-2"><CircleCheck className="size-4 text-[#67d9bc]" /> Acesso por permissões</span>
              </div>
            </div>
            <PreviaPlataforma />
          </div>
        </section>

        <section id="recursos" className="landing-secao-clara scroll-mt-20 px-5 py-20 sm:py-24 lg:px-8" aria-labelledby="titulo-recursos">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="landing-sobretitulo">Tudo conectado</p>
              <h2 id="titulo-recursos" className="mt-3 text-3xl font-extrabold leading-tight tracking-[-0.055em] text-[#0b3037] sm:text-5xl">Uma operação mais clara começa aqui.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#557077]">Cada área foi pensada para mostrar o necessário e facilitar o trabalho diário, sem telas sobrecarregadas.</p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recursos.map(({ titulo, descricao, Icone, classe }) => (
                <article key={titulo} className="landing-card-recurso rounded-3xl border border-[#dbe9e6] bg-white p-7 shadow-[0_8px_30px_rgba(11,48,55,0.04)]">
                  <span className={`mb-6 flex size-12 items-center justify-center rounded-2xl ${classe}`}><Icone className="size-6" aria-hidden="true" /></span>
                  <h3 className="text-lg font-bold tracking-[-0.035em] text-[#10343a]">{titulo}</h3>
                  <p className="mt-2 text-sm leading-7 text-[#617b80]">{descricao}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="landing-secao-verde scroll-mt-20 px-5 py-20 sm:py-24 lg:px-8" aria-labelledby="titulo-como-funciona">
          <div className="mx-auto grid max-w-7xl items-start gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <div>
              <p className="landing-sobretitulo">Simples desde o primeiro acesso</p>
              <h2 id="titulo-como-funciona" className="mt-3 text-3xl font-extrabold leading-tight tracking-[-0.055em] text-[#0b3037] sm:text-5xl">Da informação à ação, sem perder tempo.</h2>
              <p className="mt-5 max-w-md leading-7 text-[#557077]">Uma visão organizada ajuda a equipe a saber onde começar e o que acompanhar.</p>
            </div>
            <div className="space-y-4">
              {[
                { n: '01', titulo: 'Cadastre suas usinas', texto: 'Reúna dados importantes em um único cadastro e mantenha a situação de cada usina visível.', Icone: Layers3 },
                { n: '02', titulo: 'Organize licenças e tarefas', texto: 'Associe documentos e manutenções às usinas, com prazos e responsáveis definidos.', Icone: CalendarClock },
                { n: '03', titulo: 'Acompanhe o que precisa de atenção', texto: 'Use o painel e os alertas para encontrar pendências e agir com prioridade.', Icone: BellRing },
              ].map(({ n, titulo, texto, Icone }) => (
                <article key={n} className="flex items-start gap-4 rounded-2xl border border-[#d8e8e2] bg-white/75 p-5 sm:gap-5 sm:p-6">
                  <span className="font-mono text-sm font-bold text-[#298b91]">{n}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-[#10343a] sm:text-lg">{titulo}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#617b80]">{texto}</p>
                  </div>
                  <Icone className="mt-0.5 size-5 shrink-0 text-[#3b9c9e]" aria-hidden="true" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="seguranca" className="landing-secao-escura scroll-mt-20 px-5 py-20 sm:py-24 lg:px-8" aria-labelledby="titulo-seguranca">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-10 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6dd3d0]">Acesso responsável</p>
              <h2 id="titulo-seguranca" className="mt-3 text-3xl font-extrabold tracking-[-0.055em] text-white sm:text-5xl">Cada pessoa com o acesso certo.</h2>
              <p className="mt-5 leading-7 text-[#a2bdc0]">Contas individuais, permissões de administrador, gestor ou consulta e registro de atividades ajudam a organizar o trabalho em equipe.</p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-[390px]">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><LockKeyhole className="size-7 text-[#f4b54b]" aria-hidden="true" /><p className="mt-4 text-sm font-semibold text-white">Contas individuais</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><ShieldCheck className="size-7 text-[#65cdb9]" aria-hidden="true" /><p className="mt-4 text-sm font-semibold text-white">Permissões por perfil</p></div>
            </div>
          </div>
        </section>

        <section className="landing-cta px-5 py-20 text-center sm:py-24 lg:px-8" aria-labelledby="titulo-cta">
          <div className="mx-auto max-w-3xl">
            <p className="landing-sobretitulo">Seu próximo passo</p>
            <h2 id="titulo-cta" className="mt-3 text-3xl font-extrabold leading-tight tracking-[-0.055em] text-[#0b3037] sm:text-5xl">Pronto para organizar sua operação?</h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-[#557077]">Acesse sua conta para acompanhar as informações e começar o dia sabendo o que precisa ser feito.</p>
            <Link href="/login" className="landing-botao-primario mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-bold">
              Acessar plataforma <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#051e26] px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <MarcaInicio />
          <div className="flex flex-wrap gap-5 text-sm text-[#a2bdc0]">
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <Link href="/login" className="hover:text-white">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
