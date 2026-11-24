'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { AuthLayout } from '@/components/auth-layout';
import { Button, Campo, inputCls } from '@/components/ui';
import { redefinirSenhaSchema } from '@/schemas/autenticacao';

export function RedefinirSenhaForm() {
  const params = useSearchParams();
  const tokenLido = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [caps, setCaps] = useState(false);
  const [erro, setErro] = useState('');
  const [concluido, setConcluido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (tokenLido.current) return;
    tokenLido.current = true;
    const valor = params.get('token');
    setToken(valor);
    // O segredo não pode permanecer no histórico nem ser repassado como Referer.
    window.history.replaceState(window.history.state, '', '/redefinir-senha');
  }, [params]);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valido = redefinirSenhaSchema.safeParse({ token, senha, confirmacao });
    if (!valido.success) { setErro(valido.error.issues[0]?.message ?? 'Dados inválidos'); return; }
    setEnviando(true); setErro('');
    try {
      const res = await fetch('/api/auth/redefinir-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valido.data) });
      const dados: { erro?: string } = await res.json();
      if (!res.ok) { setErro(dados.erro ?? 'Não foi possível alterar a senha.'); return; }
      setConcluido(true);
    } catch { setErro('Não foi possível conectar. Tente novamente.'); }
    finally { setEnviando(false); }
  }
  return <AuthLayout titulo="Definir nova senha" descricao="Escolha uma senha com 10 a 128 caracteres.">
    {concluido ? <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Senha alterada. Entre novamente com a nova senha.</p> :
      !token ? <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">Link inválido ou não informado. Solicite uma nova recuperação de senha.</p> :
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        <Campo rotulo="Nova senha" id="nova-senha">
          <div className="relative">
            <input id="nova-senha" type={mostrar ? 'text' : 'password'} autoComplete="new-password" className={`${inputCls} h-11 rounded-xl pr-12`} value={senha} onChange={(e) => setSenha(e.target.value)} onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))} required />
            <button type="button" aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setMostrar((v) => !v)} className="absolute right-3 top-2 text-slate-500">{mostrar ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button>
          </div>
          {caps && <p className="mt-1 text-xs text-amber-700">Caps Lock está ativado.</p>}
        </Campo>
        <Campo rotulo="Confirme a nova senha" id="confirmacao">
          <input id="confirmacao" type="password" autoComplete="new-password" className={`${inputCls} h-11 rounded-xl`} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
        </Campo>
        <Button type="submit" variante="primario" carregando={enviando} className="h-11 w-full rounded-xl">Alterar senha</Button>
      </form>}
  </AuthLayout>;
}
