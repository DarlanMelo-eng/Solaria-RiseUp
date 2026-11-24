'use client';

export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">Algo deu errado</h1>
      <p className="text-slate-500">Ocorreu um erro inesperado. Tente novamente.</p>
      <button onClick={reset} className="mt-2 rounded-lg bg-sol-400 px-4 py-2 text-sm font-semibold text-marca-950 hover:bg-sol-300">Tentar de novo</button>
    </main>
  );
}
