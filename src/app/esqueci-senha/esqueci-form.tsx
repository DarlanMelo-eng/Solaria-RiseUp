'use client';
import { useState } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { Button, Campo, inputCls } from '@/components/ui';
import { esqueciSenhaSchema } from '@/schemas/autenticacao';

export function EsqueciSenhaForm() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const resultado = esqueciSenhaSchema.safeParse({ email });
    if (!resultado.success) { setErro('Informe um e-mail válido.'); return; }
    setEnviando(true);
    setErro('');
    try {
      const res = await fetch('/api/auth/esqueci-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resultado.data) });
      if (!res.ok) throw new Error('Não foi possível enviar a solicitação.');
      setEnviado(true);
    } catch { setErro('Não foi possível conectar. Tente novamente.'); }
    finally { setEnviando(false); }
  }
  return <AuthLayout titulo="Recuperar senha" descricao="Informe o e-mail vinculado à sua conta.">
    {enviado ? <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Se o e-mail existir, enviaremos as instruções.</p> :
      <form onSubmit={enviar} className="mt-6 space-y-4">
        <Campo rotulo="E-mail" id="email-recuperacao" erro={erro || undefined}>
          <input id="email-recuperacao" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} h-11 rounded-xl`} placeholder="voce@empresa.com.br" />
        </Campo>
        <Button type="submit" variante="primario" carregando={enviando} className="h-11 w-full rounded-xl">Enviar instruções</Button>
      </form>}
  </AuthLayout>;
}
