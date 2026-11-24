'use client';
import { useState, type FormEvent } from 'react';
import { Check, Palette, PanelLeft, UserRound } from 'lucide-react';
import { COR_AVATAR, iniciais } from '@/lib/avatar';
import { Button, Card, ErroCarga, inputCls, PageHeader, Skeleton } from '@/components/ui';
import { useAtualizarPerfil, usePerfil } from '@/hooks/useApi';
import { ROTULO_PAPEL } from '@/lib/permissoes';
import type { CorAvatar, MenuModo, Perfil, Tema } from '@/schemas/perfil';
import { AlterarSenha } from '@/components/alterar-senha';

const CORES: { valor: CorAvatar; titulo: string }[] = [
  { valor: 'ambar', titulo: 'Âmbar' }, { valor: 'azul', titulo: 'Azul' },
  { valor: 'verde', titulo: 'Verde' }, { valor: 'violeta', titulo: 'Violeta' },
  { valor: 'rosa', titulo: 'Rosa' },
];

export default function MeuPerfil() {
  const { data: perfil, isPending, isError, refetch } = usePerfil();
  if (isPending) return <div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  if (isError || !perfil) return <ErroCarga onTentar={() => void refetch()} />;
  // O formulário nasce com os valores do perfil já carregado (sem useEffect copiando estado).
  return <FormularioPerfil perfil={perfil} />;
}

function FormularioPerfil({ perfil }: { perfil: Perfil }) {
  const atualizar = useAtualizarPerfil();
  const [nome, setNome] = useState(perfil.nome);
  const [tema, setTema] = useState<Tema>(perfil.tema);
  const [menuModo, setMenuModo] = useState<MenuModo>(perfil.menuModo);
  const [menuFixado, setMenuFixado] = useState(perfil.menuFixado);
  const [avatarCor, setAvatarCor] = useState<CorAvatar>(perfil.avatarCor);
  const [erroNome, setErroNome] = useState('');

  const salvar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nomeFinal = nome.trim();
    if (nomeFinal.length < 2 || nomeFinal.length > 120) {
      setErroNome('O nome deve ter entre 2 e 120 caracteres.');
      return;
    }
    setErroNome('');
    atualizar.mutate({ nome: nomeFinal, tema, menuModo, menuFixado, avatarCor });
  };

  return (
    <>
      <PageHeader titulo="Meu perfil" descricao="Personalize como você vê e utiliza o Solaria. As preferências acompanham sua conta." />
      <form onSubmit={salvar} className="mx-auto max-w-4xl space-y-5">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><UserRound className="size-5 text-amber-600" /><div><h2 className="font-bold text-slate-900">Seus dados</h2><p className="text-sm text-slate-500">É assim que seu nome aparece no sistema.</p></div></div>
          <div className="flex flex-wrap items-center gap-5">
            <span className={`flex size-20 items-center justify-center rounded-2xl text-2xl font-bold ${COR_AVATAR[avatarCor]}`}>{iniciais(nome || perfil.nome)}</span>
            <div className="min-w-0 flex-1 space-y-3">
              <div><label htmlFor="nome" className="mb-1 block text-sm font-semibold text-slate-700">Nome de exibição</label>
                <input id="nome" className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} aria-invalid={!!erroNome} />
                {erroNome && <p role="alert" className="mt-1 text-xs text-red-600">{erroNome}</p>}
              </div>
              <p className="text-sm text-slate-500">E-mail: <span className="font-medium text-slate-700">{perfil.email}</span></p>
              <p className="text-sm text-slate-500">Permissão: <span className="font-medium text-slate-700">{ROTULO_PAPEL[perfil.papel]}</span></p>
            </div>
          </div>
          <fieldset className="mt-5 border-t border-slate-100 pt-4"><legend className="text-sm font-semibold text-slate-700">Cor do avatar</legend>
            <div className="mt-2 flex flex-wrap gap-3">{CORES.map((cor) => <button type="button" key={cor.valor} onClick={() => setAvatarCor(cor.valor)} aria-label={`Avatar ${cor.titulo}`} aria-pressed={avatarCor === cor.valor} className={`flex size-10 items-center justify-center rounded-full ring-offset-2 ${COR_AVATAR[cor.valor]} ${avatarCor === cor.valor ? 'ring-2 ring-amber-500' : 'opacity-70 hover:opacity-100'}`}>
              {avatarCor === cor.valor && <Check className="size-5" />}
            </button>)}</div>
          </fieldset>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3"><Palette className="size-5 text-amber-600" /><div><h2 className="font-bold text-slate-900">Aparência</h2><p className="text-sm text-slate-500">Escolha a iluminação mais confortável para você.</p></div></div>
          <div role="group" aria-label="Tema do sistema" className="grid gap-3 sm:grid-cols-3">
            {([['claro', '☀', 'Claro'], ['escuro', '☾', 'Escuro'], ['sistema', '◐', 'Automático']] as const).map(([valor, icone, rotulo]) =>
              <button key={valor} type="button" aria-pressed={tema === valor} onClick={() => setTema(valor)} className={`flex items-center justify-between rounded-xl border-2 px-4 py-4 text-left text-sm font-medium transition ${tema === valor ? 'border-amber-500 bg-amber-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:border-amber-300'}`}>
                <span><span className="mr-2 text-xl" aria-hidden>{icone}</span>{rotulo}</span>{tema === valor && <Check className="size-4" />}
              </button>)}
          </div>
          <p className="mt-3 text-xs text-slate-500">Automático segue a preferência de aparência do seu computador.</p>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3"><PanelLeft className="size-5 text-amber-600" /><div><h2 className="font-bold text-slate-900">Barra lateral</h2><p className="text-sm text-slate-500">Mais espaço para as tabelas ou mais atalhos visíveis.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([['expandido', 'Mostrar ícones e nomes'], ['recolhido', 'Mostrar apenas ícones']] as const).map(([valor, rotulo]) =>
              <button key={valor} type="button" aria-pressed={menuModo === valor} onClick={() => setMenuModo(valor)} className={`flex items-center justify-between rounded-xl border-2 p-4 text-left text-sm ${menuModo === valor ? 'border-amber-500 bg-amber-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:border-amber-300'}`}>{rotulo}{menuModo === valor && <Check className="size-4" />}</button>)}
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4">
            <input type="checkbox" className="mt-1 accent-amber-500" checked={menuFixado} onChange={(e) => setMenuFixado(e.target.checked)} />
            <span><span className="block text-sm font-semibold text-slate-800">Manter a barra fixada no computador</span><span className="block text-xs text-slate-500">Desmarque para deixar a barra escondida e abri-la quando precisar pelo menu ☰.</span></span>
          </label>
        </Card>


        <div className="flex justify-end pb-8"><Button type="submit" variante="primario" carregando={atualizar.isPending}>Salvar meu perfil</Button></div>
      </form>
      <div className="mx-auto mt-4 max-w-4xl"><AlterarSenha /></div>
    </>
  );
}
