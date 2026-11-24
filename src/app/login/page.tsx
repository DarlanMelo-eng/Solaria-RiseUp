import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default function PaginaLogin() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
