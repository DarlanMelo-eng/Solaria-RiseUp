import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RedefinirSenhaForm } from './redefinir-form';
export const metadata: Metadata = { title: 'Redefinir senha', robots: 'noindex, nofollow', referrer: 'no-referrer' };
export default function PaginaRedefinirSenha() {
  return <Suspense><RedefinirSenhaForm /></Suspense>;
}
