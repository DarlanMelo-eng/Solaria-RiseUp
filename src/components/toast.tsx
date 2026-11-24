'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface Item { id: number; tipo: 'sucesso' | 'erro'; texto: string }
interface Api { sucesso: (t: string) => void; erro: (t: string) => void }

const Ctx = createContext<Api>({ sucesso: () => {}, erro: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<Item[]>([]);
  const mostrar = useCallback((tipo: Item['tipo'], texto: string) => {
    const id = Date.now() + Math.random();
    setItens((l) => [...l.slice(-3), { id, tipo, texto }]);
    setTimeout(() => setItens((l) => l.filter((i) => i.id !== id)), tipo === 'erro' ? 6000 : 3500);
  }, []);
  const api = useMemo<Api>(() => ({ sucesso: (t) => mostrar('sucesso', t), erro: (t) => mostrar('erro', t) }), [mostrar]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:left-auto">
        {itens.map((i) => (
          <div key={i.id} className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${i.tipo === 'sucesso' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}`}>
            {i.tipo === 'sucesso' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            {i.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
