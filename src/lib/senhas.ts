import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

// Configuração mínima recomendada no OWASP Password Storage Cheat Sheet.
const parametros = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const gerarHashSenha = (senha: string) => argon2.hash(senha, parametros);
export const conferirSenha = (hash: string, senha: string) => argon2.verify(hash, senha);

// Gerado por processo: não há hash estático / senha de demonstração no código.
let hashIsca: Promise<string> | undefined;
export const conferirContraIsca = async (senha: string) => {
  hashIsca ??= gerarHashSenha(randomBytes(32).toString('base64url'));
  await conferirSenha(await hashIsca, senha);
};
