import { createHash } from 'node:crypto';
import { MIMES_DOCUMENTO, TAMANHO_MAXIMO_DOCUMENTO } from '@/lib/db/schema';

/*
 * Validação dos arquivos de documentos (Lote 13). Sem dependências novas: só node:crypto.
 * A API de upload (Lote 14) chama `prepararArquivo` antes de gravar; o download (Lote 15) chama
 * `conteudoIntegro` antes de enviar. O banco confere de novo tamanho e SHA-256 (trigger da 0003).
 */

export type MimeDocumento = (typeof MIMES_DOCUMENTO)[number];
export { TAMANHO_MAXIMO_DOCUMENTO };

/** Assinaturas ("magic bytes") no começo do arquivo. A extensão e o tipo do navegador são ignorados. */
const ASSINATURAS: { mime: MimeDocumento; bytes: number[]; extensao: string }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], extensao: 'pdf' }, // %PDF-
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], extensao: 'png' },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], extensao: 'jpg' },
];

export const EXTENSAO_DO_MIME: Record<MimeDocumento, string> =
  Object.fromEntries(ASSINATURAS.map((a) => [a.mime, a.extensao])) as Record<MimeDocumento, string>;

/** Tipo pelo conteúdo, ou null se não for PDF, PNG ou JPEG. */
export function detectarTipo(bytes: Uint8Array): MimeDocumento | null {
  const achado = ASSINATURAS.find((a) => bytes.length >= a.bytes.length && a.bytes.every((b, i) => bytes[i] === b));
  return achado?.mime ?? null;
}

export const calcularSha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Confere os bytes lidos do banco com o SHA-256 gravado no envio. */
export const conteudoIntegro = (bytes: Uint8Array, sha256Esperado: string) =>
  bytes.length > 0 && calcularSha256(bytes) === sha256Esperado;

const LIMITE_NOME = 200;
// Controle (inclui \0, \n, \r), formatação invisível (inclui o U+202E que inverte o texto, usado para
// disfarçar "relatorio\u202Efdp.exe") e separadores de linha/parágrafo.
const INVISIVEIS = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
const PROIBIDOS = /[<>:"/\\|?*]/g; // reservados em Windows ou perigosos em cabeçalhos

/**
 * Nome só para exibir e para o download. Remove caminho, caracteres invisíveis ou reservados,
 * pontos e espaços nas pontas; limita a 200 caracteres preservando a extensão e garante a
 * extensão do tipo REAL (um PNG chamado "foto.pdf" vira "foto.pdf.png"). O arquivo é sempre
 * identificado pelo id, nunca pelo nome.
 */
export function limparNomeArquivo(nome: string, mime: MimeDocumento): string {
  const semCaminho = nome.normalize('NFC').split(/[/\\]/).pop() ?? '';
  let limpo = semCaminho.replace(INVISIVEIS, '').replace(PROIBIDOS, '_').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
  const extensao = EXTENSAO_DO_MIME[mime];
  const extensoesValidas = mime === 'image/jpeg' ? ['jpg', 'jpeg'] : [extensao];
  const atual = limpo.includes('.') ? limpo.slice(limpo.lastIndexOf('.') + 1).toLowerCase() : '';
  if (!limpo) limpo = 'arquivo';
  if (!extensoesValidas.includes(atual)) limpo = `${limpo}.${extensao}`;
  if (limpo.length > LIMITE_NOME) {
    const sufixo = limpo.slice(limpo.lastIndexOf('.'));
    limpo = limpo.slice(0, LIMITE_NOME - sufixo.length).replace(/[\s.]+$/, '') + sufixo;
  }
  return limpo;
}

export type ArquivoPreparado = { ok: true; mime: MimeDocumento; nomeArquivo: string; tamanhoBytes: number; sha256: string };
export type ArquivoRecusado = { ok: false; status: 400 | 413 | 415; erro: string };

/**
 * Valida um arquivo recebido. `tamanhoDeclarado` (Content-Length do arquivo ou do formulário) serve
 * para detectar corpo cortado: o Next guarda o corpo em memória até 10 MB e, acima disso, corta sem
 * avisar. Por isso o limite da aplicação (8 MB) fica abaixo, e o tamanho recebido é comparado.
 */
export function prepararArquivo(entrada: { nome: string; bytes: Uint8Array; tamanhoDeclarado?: number }): ArquivoPreparado | ArquivoRecusado {
  const { nome, bytes, tamanhoDeclarado } = entrada;
  if (tamanhoDeclarado !== undefined && tamanhoDeclarado > TAMANHO_MAXIMO_DOCUMENTO) {
    return { ok: false, status: 413, erro: 'O arquivo passa de 8 MB' };
  }
  if (bytes.length === 0) return { ok: false, status: 400, erro: 'O arquivo está vazio' };
  if (bytes.length > TAMANHO_MAXIMO_DOCUMENTO) return { ok: false, status: 413, erro: 'O arquivo passa de 8 MB' };
  if (tamanhoDeclarado !== undefined && tamanhoDeclarado !== bytes.length) {
    return { ok: false, status: 400, erro: 'O arquivo chegou incompleto. Envie de novo' };
  }
  const mime = detectarTipo(bytes);
  if (!mime) return { ok: false, status: 415, erro: 'Envie um arquivo PDF, PNG ou JPEG' };
  return { ok: true, mime, nomeArquivo: limparNomeArquivo(nome, mime), tamanhoBytes: bytes.length, sha256: calcularSha256(bytes) };
}
