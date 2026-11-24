import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { banco } from '@/lib/db';
import { usuarios } from '@/lib/db/schema';
import { esqueciSenhaSchema } from '@/schemas/autenticacao';
import { protegerOrigem } from '@/lib/http';
import { obterIp } from '@/lib/ip';
import { chavesTentativa, registrarFalhas, segundosBloqueado } from '@/lib/tentativas';
import { emitirToken, enviarLinkRecuperacao, MENSAGEM_RECUPERACAO } from '@/lib/recuperacao';
export const runtime = 'nodejs';
const resposta = () => NextResponse.json({ mensagem: MENSAGEM_RECUPERACAO }, { headers: { 'Cache-Control': 'no-store' } });
const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  const csrf = protegerOrigem(req);
  if (csrf) return csrf;
  const corpo: unknown = await req.json().catch(() => null);
  const r = esqueciSenhaSchema.safeParse(corpo);
  const email = r.success ? r.data.email : '';
  const ip = obterIp(req);
  // Contador separado por e-mail e IP: impedir flood sem confirmar existência de conta.
  const chaves = chavesTentativa('reset', email || 'invalido', ip);
  const bloqueado = await segundosBloqueado(chaves);
  if (!bloqueado) {
    await registrarFalhas(chaves);
    if (email) {
      const [usuario] = await banco.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
      if (usuario?.ativo) {
        try {
          const link = await emitirToken(usuario.id, ip);
          await enviarLinkRecuperacao(email, link);
        } catch {
          console.error('Falha no processamento do envio de recuperação de senha.');
        }
      }
    }
  }
  // Piso temporal idêntico; em produção, entregas SMTP muito lentas devem ser delegadas a uma fila.
  await pausa(Math.max(0, 900 - (Date.now() - inicio)));
  return resposta();
}
