import { describe, expect, it } from 'vitest';
import {
  calcularSha256, conteudoIntegro, detectarTipo, limparNomeArquivo, prepararArquivo, TAMANHO_MAXIMO_DOCUMENTO,
} from '@/lib/armazenamento';

/* Validação de arquivos de documentos (Lote 13): tipo pelo conteúdo, limite de 8 MB, corpo cortado,
 * SHA-256 e limpeza do nome. Sem banco. */

const bytes = (...valores: (number | string)[]) =>
  Uint8Array.from(valores.flatMap((v) => (typeof v === 'string' ? [...Buffer.from(v, 'latin1')] : [v])));
const PDF = bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 'IHDR');
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 'JFIF', 0);

describe('Tipo pelo conteúdo (magic bytes)', () => {
  it('reconhece PDF, PNG e JPEG', () => {
    expect(detectarTipo(PDF)).toBe('application/pdf');
    expect(detectarTipo(PNG)).toBe('image/png');
    expect(detectarTipo(JPEG)).toBe('image/jpeg');
  });

  it('recusa HTML, executável, GIF, texto, vazio e assinatura incompleta', () => {
    expect(detectarTipo(bytes('<!DOCTYPE html><script>alert(1)</script>'))).toBeNull();
    expect(detectarTipo(bytes(' %PDF-1.7'))).toBeNull(); // a assinatura precisa estar no byte 0
    expect(detectarTipo(bytes('MZ', 0x90, 0))).toBeNull();
    expect(detectarTipo(bytes('GIF89a'))).toBeNull();
    expect(detectarTipo(bytes('apenas texto'))).toBeNull();
    expect(detectarTipo(new Uint8Array())).toBeNull();
    expect(detectarTipo(PNG.slice(0, 4))).toBeNull();
  });
});

describe('prepararArquivo', () => {
  it('aceita e devolve tipo real, nome limpo, tamanho e SHA-256', () => {
    const r = prepararArquivo({ nome: 'Relatório Mensal.pdf', bytes: PDF, tamanhoDeclarado: PDF.length });
    expect(r).toEqual({ ok: true, mime: 'application/pdf', nomeArquivo: 'Relatório Mensal.pdf', tamanhoBytes: PDF.length, sha256: calcularSha256(PDF) });
  });

  it('o nome e a extensão não decidem o tipo: HTML ou executável chamados de .pdf são recusados (415)', () => {
    expect(prepararArquivo({ nome: 'laudo.pdf', bytes: bytes('<html><body>oi</body></html>') })).toMatchObject({ ok: false, status: 415 });
    expect(prepararArquivo({ nome: 'foto.jpg', bytes: bytes('MZ', 0x90, 0, 3, 0) })).toMatchObject({ ok: false, status: 415 });
  });

  it('limite de 8 MB: exatamente 8 MB passa; um byte a mais é 413, inclusive pelo tamanho declarado', () => {
    const limite = new Uint8Array(TAMANHO_MAXIMO_DOCUMENTO);
    limite.set(PDF);
    expect(prepararArquivo({ nome: 'grande.pdf', bytes: limite })).toMatchObject({ ok: true, tamanhoBytes: 8 * 1024 * 1024 });
    const acima = new Uint8Array(TAMANHO_MAXIMO_DOCUMENTO + 1);
    acima.set(PDF);
    expect(prepararArquivo({ nome: 'grande.pdf', bytes: acima })).toMatchObject({ ok: false, status: 413 });
    expect(prepararArquivo({ nome: 'x.pdf', bytes: PDF, tamanhoDeclarado: TAMANHO_MAXIMO_DOCUMENTO + 1 })).toMatchObject({ ok: false, status: 413 });
  });

  it('corpo cortado (recebido menor que o declarado) e arquivo vazio: 400', () => {
    expect(prepararArquivo({ nome: 'x.pdf', bytes: PDF, tamanhoDeclarado: PDF.length + 100 })).toMatchObject({
      ok: false, status: 400, erro: 'O arquivo chegou incompleto. Envie de novo',
    });
    expect(prepararArquivo({ nome: 'x.pdf', bytes: new Uint8Array() })).toMatchObject({ ok: false, status: 400 });
  });
});

describe('Integridade (SHA-256)', () => {
  it('vetor de teste conhecido e formato hexadecimal minúsculo de 64 caracteres', () => {
    expect(calcularSha256(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(calcularSha256(PDF)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('um único byte alterado é detectado', () => {
    const sha = calcularSha256(PDF);
    expect(conteudoIntegro(PDF, sha)).toBe(true);
    const alterado = PDF.slice();
    alterado[10] ^= 1;
    expect(conteudoIntegro(alterado, sha)).toBe(false);
    expect(conteudoIntegro(new Uint8Array(), calcularSha256(new Uint8Array()))).toBe(false);
  });
});

describe('Nome do arquivo', () => {
  const pdf = (nome: string) => limparNomeArquivo(nome, 'application/pdf');

  it('remove caminhos (Unix e Windows)', () => {
    expect(pdf('../../etc/passwd')).toBe('passwd.pdf');
    expect(pdf('C:\\Users\\ana\\Documentos\\licenca.pdf')).toBe('licenca.pdf');
  });

  it('remove caracteres invisíveis, inclusive o que inverte o texto (U+202E)', () => {
    expect(pdf('relatorio\u202Efdp.exe')).toBe('relatoriofdp.exe.pdf');
    expect(pdf('a\u0000b\nc\rd\u200Be.pdf')).toBe('abcde.pdf');
  });

  it('troca caracteres reservados, junta espaços e tira pontos e espaços das pontas', () => {
    expect(pdf('laudo <final>: "v2" | ok?*.pdf')).toBe('laudo _final__ _v2_ _ ok__.pdf');
    expect(pdf('  ..oculto   com   espaços.pdf  ')).toBe('oculto com espaços.pdf');
  });

  it('nome vazio vira "arquivo"; garante a extensão do tipo real', () => {
    expect(pdf('   ')).toBe('arquivo.pdf');
    expect(pdf('...')).toBe('arquivo.pdf');
    expect(limparNomeArquivo('foto.pdf', 'image/png')).toBe('foto.pdf.png');
    expect(limparNomeArquivo('scan.JPEG', 'image/jpeg')).toBe('scan.JPEG');
    expect(limparNomeArquivo('scan.jpg', 'image/jpeg')).toBe('scan.jpg');
    expect(pdf('contrato')).toBe('contrato.pdf');
  });

  it('limita a 200 caracteres preservando a extensão e normaliza acentos (NFC)', () => {
    const longo = pdf(`${'a'.repeat(300)}.pdf`);
    expect(longo).toHaveLength(200);
    expect(longo.endsWith('.pdf')).toBe(true);
    const decomposto = 'Relato\u0301rio.pdf'; // "o" + acento combinado
    expect(pdf(decomposto)).toBe('Relatório.pdf');
    expect(pdf(decomposto)).toHaveLength('Relatório.pdf'.length);
  });
});
