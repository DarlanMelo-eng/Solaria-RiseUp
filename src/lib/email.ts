import nodemailer from 'nodemailer';

interface Mensagem { para: string; assunto: string; texto: string; linkDesenvolvimento?: string }

export async function enviarEmail({ para, assunto, texto, linkDesenvolvimento }: Mensagem) {
  const host = process.env.SMTP_HOST;
  const remetente = process.env.SMTP_FROM;
  if (!host || !remetente) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_HOST e SMTP_FROM são obrigatórios em produção.');
    // Exceção intencional apenas em desenvolvimento: consultar a URL no console do servidor.
    if (linkDesenvolvimento) console.info('[DEV] Link de redefinição:', linkDesenvolvimento);
    else console.info('[DEV] Notificação por e-mail simulada.');
    return;
  }
  const porta = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isSafeInteger(porta) || porta < 1 || porta > 65535) throw new Error('SMTP_PORT inválida.');
  const usuario = process.env.SMTP_USER;
  const senha = process.env.SMTP_PASSWORD;
  const transport = nodemailer.createTransport({
    host, port: porta, secure: process.env.SMTP_SECURE === 'true',
    ...(usuario && senha ? { auth: { user: usuario, pass: senha } } : {}),
    requireTLS: process.env.SMTP_SECURE !== 'true',
  });
  await transport.sendMail({ from: remetente, to: para, subject: assunto, text: texto });
}
