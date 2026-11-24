'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { TelaAcesso } from '@/components/auth-layout';
import { Button, Campo, inputCls } from '@/components/ui';
import { api, ApiError } from '@/hooks/useApi';
import { loginSchema, type LoginDados } from '@/schemas/solar';
import type { Sessao } from '@/types/solar';

const CHAVE_INTRO = 'solaria:intro-vista';

/** Só aceita caminhos internos (evita redirecionamento para sites externos). */
const destinoSeguro = (n: string | null) => {
  if (!n || !n.startsWith('/') || n.startsWith('//') || n.includes('\\') || /%(?:2f|5c|0a|0d)/i.test(n)) return '/dashboard';
  try {
    const destino = new URL(n, 'https://solaria.invalid');
    if (destino.origin !== 'https://solaria.invalid' ||
        ['/login', '/esqueci-senha', '/redefinir-senha'].includes(destino.pathname)) return '/dashboard';
    return `${destino.pathname}${destino.search}${destino.hash}`;
  } catch { return '/dashboard'; }
};

export function LoginForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const destino = destinoSeguro(useSearchParams().get('next'));
  const [verSenha, setVerSenha] = useState(false);
  const [caps, setCaps] = useState(false);
  const [erro, setErro] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginDados>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
  });
  const senha = register('senha');

  // O nascer do sol toca uma vez por sessão do navegador; depois a tela já abre pronta.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CHAVE_INTRO)) document.documentElement.classList.add('sem-intro');
      else sessionStorage.setItem(CHAVE_INTRO, '1');
    } catch { /* armazenamento indisponível: a animação toca sempre */ }
  }, []);

  const entrar = handleSubmit(async (dados) => {
    setErro('');
    try {
      const sessao = await api<Sessao>('/api/auth/login', { method: 'POST', json: dados });
      // Descarta o cache de uma conta anterior antes de entrar com outra.
      qc.clear();
      qc.setQueryData(['sessao'], sessao);
      router.replace(destino);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível conectar. Verifique sua internet e tente de novo.');
    }
  });

  return (
    <TelaAcesso rodape={<Link className="hover:text-slate-700 hover:underline" href="/">Conhecer o Solaria</Link>}>
      <h1 className="text-3xl font-bold tracking-tight text-marca-950">Bem-vindo de volta</h1>
      <p className="mt-1.5 text-sm text-slate-500">Entre para acompanhar suas usinas.</p>

      <form onSubmit={entrar} noValidate className="mt-8 space-y-5">
        {erro && (
          <p key={erro} role="alert" className="tremer flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{erro}
          </p>
        )}
        <Campo rotulo="E-mail" id="email" erro={errors.email?.message}>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" aria-hidden />
            <input id="email" type="email" autoComplete="username" autoFocus placeholder="voce@empresa.com.br"
              className={`${inputCls} h-11 rounded-xl pl-10`} aria-invalid={!!errors.email} {...register('email')} />
          </div>
        </Campo>
        <Campo rotulo="Senha" id="senha" erro={errors.senha?.message}>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" aria-hidden />
            <input id="senha" type={verSenha ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" aria-invalid={!!errors.senha}
              className={`${inputCls} h-11 rounded-xl pl-10 pr-11`} {...senha}
              onBlur={(e) => { senha.onBlur(e); setCaps(false); }} onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))} />
            <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-1.5 top-1.5 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {caps && <p role="status" className="mt-1 text-xs font-medium text-amber-700">Caps Lock está ativado.</p>}
        </Campo>
        <div className="flex justify-end">
          <Link className="text-sm font-semibold text-marca-700 hover:underline" href="/esqueci-senha">Esqueci minha senha</Link>
        </div>
        <Button type="submit" variante="primario" carregando={isSubmitting} className="h-12 w-full rounded-xl text-base font-bold">
          {isSubmitting ? 'Verificando acesso…' : <>Entrar <ArrowRight className="size-4" aria-hidden /></>}
        </Button>
      </form>
    </TelaAcesso>
  );
}
