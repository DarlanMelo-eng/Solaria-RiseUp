import type { Metadata } from 'next';
import { EsqueciSenhaForm } from './esqueci-form';
export const metadata: Metadata = { title: 'Esqueci minha senha', robots: 'noindex, nofollow' };
export default function PaginaEsqueciSenha() { return <EsqueciSenhaForm />; }
