import Link from 'next/link';

export default function NaoEncontrada() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-6xl font-bold text-amber-500">404</p>
      <h1 className="text-xl font-bold text-slate-900">Página não encontrada</h1>
      <p className="text-slate-500">O endereço não existe ou foi movido.</p>
      <Link href="/dashboard" className="mt-2 rounded-lg bg-sol-400 px-4 py-2 text-sm font-semibold text-marca-950 hover:bg-sol-300">Ir para o dashboard</Link>
    </main>
  );
}
