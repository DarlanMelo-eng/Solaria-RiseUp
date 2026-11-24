import { TelaCarregando } from '@/components/ui';

/** Navegação interna com feedback imediato enquanto a próxima tela prepara os dados. */
export default function Carregando() {
  return <section aria-live="polite" aria-label="Carregando página"><TelaCarregando /></section>;
}
