import { and, isNull, lt, or, sql } from 'drizzle-orm';
import { banco } from '@/lib/db';
import { tentativasLogin } from '@/lib/db/schema';
import { IP_DESCONHECIDO } from '@/lib/ip';

/**
 * Limites de falhas em 15 minutos antes de bloquear (o bloqueio começa em 60s e dobra até 15 min).
 * - Por e-mail: protege cada conta contra quem tenta adivinhar a senha dela.
 * - Por IP: mais alto, porque um IP público pode ser de uma faculdade ou empresa inteira.
 *   Ainda assim segura quem tenta várias contas a partir do mesmo endereço.
 */
export const LIMITE_POR_EMAIL = 5;
export const LIMITE_POR_IP = 20;

/** Sem IP confiável não há como diferenciar pessoas: aceita também a forma "troca:desconhecido". */
const ipConfiavel = (ip: string) => ip !== IP_DESCONHECIDO && !ip.endsWith(`:${IP_DESCONHECIDO}`);

/**
 * Chaves de contagem de uma tentativa. A chave do e-mail vem sempre primeiro (o login limpa só ela).
 * Sem IP confiável, NÃO existe chave de IP: com ela, todas as pessoas dividiriam o mesmo contador
 * e 5 erros de qualquer um bloqueariam o acesso de todos.
 */
export const chavesTentativa = (prefixo: 'login' | 'reset', email: string, ip: string) => {
  const chaves = [`${prefixo}:email:${email.toLowerCase()}`];
  if (ipConfiavel(ip)) chaves.push(`${prefixo}:ip:${ip}`);
  return chaves;
};

/** "login:ip:..." e "reset:ip:..." usam o limite por IP; as demais, o limite por e-mail. */
const limiteDa = (chave: string) => (chave.split(':')[1] === 'ip' ? LIMITE_POR_IP : LIMITE_POR_EMAIL);

export async function segundosBloqueado(chaves: string[], agora = new Date()) {
  const linhas = await banco.select().from(tentativasLogin).where(
    sql`${tentativasLogin.chave} IN (${sql.join(chaves.map((c) => sql`${c}`), sql`, `)})`,
  );
  return Math.max(0, ...linhas.map((l) => l.bloqueadoAte && l.bloqueadoAte > agora
    ? Math.ceil((l.bloqueadoAte.getTime() - agora.getTime()) / 1000) : 0));
}

/** INSERT...ON CONFLICT atômico para funcionar entre instâncias. Bloqueia ao atingir o limite da chave. */
let ultimaLimpeza = 0;
export async function registrarFalhas(chaves: string[]) {
  if (Date.now() - ultimaLimpeza > 86_400_000) {
    ultimaLimpeza = Date.now();
    await limparTentativasAntigas();
  }
  await Promise.all(chaves.map(async (chave) => {
    const now = new Date();
    const limite = limiteDa(chave);
    // Contagem nova: reinicia em 1 se a última falha tiver mais de 15 minutos.
    const contagem = sql`(CASE WHEN ${tentativasLogin.atualizadoEm} < now() - interval '15 minutes' THEN 1 ELSE ${tentativasLogin.contagem} + 1 END)`;
    await banco.insert(tentativasLogin).values({ chave, contagem: 1, atualizadoEm: now })
      .onConflictDoUpdate({ target: tentativasLogin.chave, set: {
        contagem,
        atualizadoEm: now,
        bloqueadoAte: sql`CASE WHEN ${contagem} >= ${limite}::int
          THEN now() + make_interval(secs => LEAST(900, 60 * power(2, LEAST(4, ${contagem} - ${limite}::int)))::int)
          ELSE NULL END`,
      }});
  }));
}
export async function limparFalhas(chaves: string[]) {
  await banco.delete(tentativasLogin).where(sql`${tentativasLogin.chave} IN (${sql.join(chaves.map((c) => sql`${c}`), sql`, `)})`);
}
export async function limparTentativasAntigas() {
  await banco.delete(tentativasLogin).where(and(lt(tentativasLogin.atualizadoEm, new Date(Date.now() - 86_400_000)),
    or(isNull(tentativasLogin.bloqueadoAte), lt(tentativasLogin.bloqueadoAte, new Date()))));
}
