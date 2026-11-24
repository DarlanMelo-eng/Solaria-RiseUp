'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { api, ApiError } from '@/hooks/useApi';
import { alterarSenhaSchema } from '@/schemas/autenticacao';
import { Button, Card, Campo, inputCls } from '@/components/ui';

type Erros = Partial<Record<'senhaAtual' | 'novaSenha' | 'confirmacao', string>>;

export function AlterarSenha() {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState('');

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroGeral('');
    const resultado = alterarSenhaSchema.safeParse({ senhaAtual, novaSenha, confirmacao });
    if (!resultado.success) {
      const errosCampos: Erros = {};
      for (const questao of resultado.error.issues) {
        const campo = String(questao.path[0]);
        if (campo === 'senhaAtual' || campo === 'novaSenha' || campo === 'confirmacao') {
          errosCampos[campo] ??= questao.message;
        }
      }
      setErros(errosCampos);
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      await api('/api/auth/alterar-senha', { method: 'POST', json: resultado.data });
      // O servidor revoga os cookies de todos os dispositivos após a alteração.
      window.location.replace('/login?senha_alterada=1');
    } catch (e) {
      if (e instanceof ApiError && e.detalhes) setErros(e.detalhes);
      setErroGeral(e instanceof Error ? e.message : 'Não foi possível alterar a senha.');
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3"><LockKeyhole className="size-5 text-amber-600" />
        <div><h2 className="font-bold text-slate-900">Alterar minha senha</h2>
          <p className="text-sm text-slate-500">Confirme sua senha atual para definir outra. Depois será necessário entrar novamente.</p>
        </div>
      </div>
      <form onSubmit={salvar} className="space-y-4" autoComplete="off">
        <Campo id="senhaAtual" rotulo="Senha atual" erro={erros.senhaAtual}>
          <input id="senhaAtual" type={mostrar ? 'text' : 'password'} autoComplete="current-password" required
            className={inputCls} value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="novaSenha" rotulo="Nova senha" erro={erros.novaSenha} dica="Use de 10 a 128 caracteres.">
            <input id="novaSenha" type={mostrar ? 'text' : 'password'} autoComplete="new-password" required
              className={inputCls} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
          </Campo>
          <Campo id="confirmacao" rotulo="Confirmar nova senha" erro={erros.confirmacao}>
            <input id="confirmacao" type={mostrar ? 'text' : 'password'} autoComplete="new-password" required
              className={inputCls} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
          {mostrar ? <EyeOff className="size-4" /> : <Eye className="size-4" />} Mostrar senhas
        </label>
        {erroGeral && <p role="alert" className="text-sm text-red-600">{erroGeral}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/esqueci-senha" className="text-sm font-medium text-amber-700 hover:underline">Esqueceu a senha atual?</Link>
          <Button type="submit" variante="primario" carregando={enviando}>Alterar senha</Button>
        </div>
      </form>
    </Card>
  );
}
