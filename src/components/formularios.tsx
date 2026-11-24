'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, useCriarLicenca, useCriarManutencao, useCriarUsina, useEditarLicenca, useEditarManutencao, useEditarUsina } from '@/hooks/useApi';
import { licencaSchema, manutencaoSchema, TIPOS_LICENCA, usinaSchema, type LicencaDados, type ManutencaoDados, type UsinaDados } from '@/schemas/solar';
import type { Licenca, Manutencao, Usina } from '@/types/solar';
import { Button, Campo, inputCls, Modal, ROTULO_STATUS_MANUTENCAO } from './ui';

type Erros = { setError: (n: never, e: { message: string }) => void };
const mostrarErros = (e: unknown, f: Erros) => {
  if (e instanceof ApiError && e.detalhes) for (const [k, message] of Object.entries(e.detalhes)) f.setError(k as never, { message });
};

function Rodape({ salvando, rotulo, onFechar }: { salvando: boolean; rotulo: string; onFechar: () => void }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <Button onClick={onFechar}>Cancelar</Button>
      <Button type="submit" variante="primario" carregando={salvando}>{rotulo}</Button>
    </div>
  );
}

export function UsinaModal({ usina, onFechar }: { usina?: Usina; onFechar: () => void }) {
  const criar = useCriarUsina();
  const editar = useEditarUsina();
  const f = useForm<UsinaDados>({
    resolver: zodResolver(usinaSchema),
    defaultValues: usina ?? { nome: '', localizacao: '', status: 'ativa' },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = f;
  const salvar = handleSubmit(async (d) => {
    try {
      if (usina) await editar.mutateAsync({ id: usina.id, dados: d });
      else await criar.mutateAsync(d);
      onFechar();
    } catch (e) { mostrarErros(e, f as unknown as Erros); }
  });
  return (
    <Modal titulo={usina ? 'Editar usina' : 'Nova usina'} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <Campo rotulo="Nome" id="u-nome" erro={errors.nome?.message}>
          <input id="u-nome" className={inputCls} aria-invalid={!!errors.nome} {...register('nome')} />
        </Campo>
        <Campo rotulo="Localização" id="u-loc" erro={errors.localizacao?.message} dica="Cidade, UF — ex.: Petrolina, PE">
          <input id="u-loc" className={inputCls} aria-invalid={!!errors.localizacao} {...register('localizacao')} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Capacidade (kWp)" id="u-cap" erro={errors.capacidadeKwp?.message}>
            <input id="u-cap" type="number" step="any" min="0" className={inputCls} aria-invalid={!!errors.capacidadeKwp} {...register('capacidadeKwp', { valueAsNumber: true })} />
          </Campo>
          <Campo rotulo="Situação" id="u-status">
            <select id="u-status" className={inputCls} {...register('status')}>
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa (somente leitura)</option>
            </select>
          </Campo>
        </div>
        <Rodape salvando={isSubmitting} rotulo={usina ? 'Salvar alterações' : 'Cadastrar usina'} onFechar={onFechar} />
      </form>
    </Modal>
  );
}

function SeletorUsina({ id, usinas, fixa, erro, reg }: { id: string; usinas: Usina[]; fixa: boolean; erro?: string; reg: object }) {
  return (
    <Campo rotulo="Usina" id={id} erro={erro}>
      <select id={id} className={inputCls} disabled={fixa} aria-invalid={!!erro} {...reg}>
        <option value="">Selecione…</option>
        {usinas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </select>
    </Campo>
  );
}

interface FormProps<T> { item?: T; usinas: Usina[]; usinaId?: string; onFechar: () => void }

export function LicencaModal({ item, usinas, usinaId, onFechar }: FormProps<Licenca>) {
  const criar = useCriarLicenca();
  const editar = useEditarLicenca();
  const f = useForm<LicencaDados>({
    resolver: zodResolver(licencaSchema),
    defaultValues: item ?? { usinaId: usinaId ?? '', tipo: '', emissor: '', numero: '', dataValidade: '', observacao: '' },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = f;
  const salvar = handleSubmit(async (d) => {
    try {
      if (item) await editar.mutateAsync({ id: item.id, dados: d });
      else await criar.mutateAsync(d);
      onFechar();
    } catch (e) { mostrarErros(e, f as unknown as Erros); }
  });
  return (
    <Modal titulo={item ? 'Editar licença' : 'Nova licença'} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <SeletorUsina id="l-usina" usinas={usinas} fixa={!!item || !!usinaId} erro={errors.usinaId?.message} reg={register('usinaId')} />
        <Campo rotulo="Tipo" id="l-tipo" erro={errors.tipo?.message}>
          <input id="l-tipo" list="tipos-licenca" className={inputCls} aria-invalid={!!errors.tipo} {...register('tipo')} />
          <datalist id="tipos-licenca">{TIPOS_LICENCA.map((t) => <option key={t} value={t} />)}</datalist>
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Órgão emissor" id="l-emissor" erro={errors.emissor?.message}>
            <input id="l-emissor" className={inputCls} aria-invalid={!!errors.emissor} {...register('emissor')} />
          </Campo>
          <Campo rotulo="Número" id="l-numero" erro={errors.numero?.message}>
            <input id="l-numero" className={inputCls} aria-invalid={!!errors.numero} {...register('numero')} />
          </Campo>
        </div>
        <Campo rotulo="Validade" id="l-validade" erro={errors.dataValidade?.message}>
          <input id="l-validade" type="date" className={inputCls} aria-invalid={!!errors.dataValidade} {...register('dataValidade')} />
        </Campo>
        <Campo rotulo="Observação (opcional)" id="l-obs" erro={errors.observacao?.message}>
          <textarea id="l-obs" rows={2} className={inputCls} {...register('observacao')} />
        </Campo>
        <Rodape salvando={isSubmitting} rotulo={item ? 'Salvar alterações' : 'Cadastrar licença'} onFechar={onFechar} />
      </form>
    </Modal>
  );
}

export function ManutencaoModal({ item, usinas, usinaId, onFechar }: FormProps<Manutencao>) {
  const criar = useCriarManutencao();
  const editar = useEditarManutencao();
  const f = useForm<ManutencaoDados>({
    resolver: zodResolver(manutencaoSchema),
    defaultValues: item ?? { usinaId: usinaId ?? '', titulo: '', responsavel: '', prazo: '', prioridade: 'media', status: 'pendente' },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = f;
  const salvar = handleSubmit(async (d) => {
    try {
      if (item) await editar.mutateAsync({ id: item.id, dados: d });
      else await criar.mutateAsync(d);
      onFechar();
    } catch (e) { mostrarErros(e, f as unknown as Erros); }
  });
  return (
    <Modal titulo={item ? 'Editar manutenção' : 'Nova manutenção'} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <SeletorUsina id="m-usina" usinas={usinas} fixa={!!item || !!usinaId} erro={errors.usinaId?.message} reg={register('usinaId')} />
        <Campo rotulo="Título" id="m-titulo" erro={errors.titulo?.message}>
          <input id="m-titulo" className={inputCls} aria-invalid={!!errors.titulo} {...register('titulo')} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Responsável" id="m-resp" erro={errors.responsavel?.message}>
            <input id="m-resp" className={inputCls} aria-invalid={!!errors.responsavel} {...register('responsavel')} />
          </Campo>
          <Campo rotulo="Prazo" id="m-prazo" erro={errors.prazo?.message}>
            <input id="m-prazo" type="date" className={inputCls} aria-invalid={!!errors.prazo} {...register('prazo')} />
          </Campo>
          <Campo rotulo="Prioridade" id="m-prio">
            <select id="m-prio" className={inputCls} {...register('prioridade')}>
              <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
            </select>
          </Campo>
          <Campo rotulo="Status" id="m-status">
            <select id="m-status" className={inputCls} {...register('status')}>
              {Object.entries(ROTULO_STATUS_MANUTENCAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </Campo>
        </div>
        <Rodape salvando={isSubmitting} rotulo={item ? 'Salvar alterações' : 'Agendar manutenção'} onFechar={onFechar} />
      </form>
    </Modal>
  );
}
