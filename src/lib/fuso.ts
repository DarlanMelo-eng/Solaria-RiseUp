// O servidor pode rodar em UTC; as datas do negócio (conclusão, dados de exemplo) seguem o fuso configurado.
const FUSO = process.env.FUSO_HORARIO || 'America/Recife';

/** Data de hoje (AAAA-MM-DD) no fuso do negócio. */
export const hojeServidor = (agora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
