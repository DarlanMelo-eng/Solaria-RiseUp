/** "1 usina" / "3 usinas": evita textos como "usina(s)" na interface. */
export const contar = (n: number, singular: string, plural: string) =>
  `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : plural}`;
