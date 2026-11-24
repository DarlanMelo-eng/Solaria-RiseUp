'use client';
import { useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Undo2 } from 'lucide-react';
import {
  ApiError, useCancelarCumprimento, useCriarCondicionante, useCumprimentos, useEditarCondicionante, useRegistrarCumprimento,
} from '@/hooks/useApi';
import {
  cancelamentoCumprimentoSchema, condicionanteEdicaoSchema, condicionanteSchema, cumprimentoSchema,
  type CancelamentoCumprimentoDados, type CondicionanteDados, type CondicionanteEdicao, type CumprimentoDados,
} from '@/schemas/solar';
import type { Condicionante, Licenca, Usina } from '@/types/solar';
import { cumprimentoDesfazivel } from '@/utils/condicionantes';
import { formatarData, formatarDataHora, hojeISO } from '@/utils/datas';
import { ROTULO_CATEGORIA, ROTULO_PERIODICIDADE, ROTULO_STATUS_CONDICIONANTE } from '@/utils/periodicidade';
import { Badge, Button, Campo, Confirmar, ErroCarga, inputCls, Modal, Skeleton } from './ui';

/** Erros de campo devolvidos pela API (422) vão para o campo; os demais viram aviso (hooks). */
function mostrarErros(e: unknown, setError: (campo: never, erro: { message: string }) => void) {
  if (e instanceof ApiError && e.detalhes) for (const [campo, message] of Object.entries(e.detalhes)) setError(campo as never, { message });
}

function Rodape({ salvando, rotulo, onFechar }: { salvando: boolean; rotulo: string; onFechar: () => void }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <Button onClick={onFechar}>Cancelar</Button>
      <Button type="submit" variante="primario" carregando={salvando}>{rotulo}</Button>
    </div>
  );
}

type NomeCampo = 'codigo' | 'descricao' | 'categoria' | 'responsavel' | 'periodicidade' | 'prazo' | 'observacao';

/** Campos comuns ao cadastro e à edição. `travarCalendario`: única já cumprida (a API recusaria a mudança). */
function CamposCondicionante({ reg, erros, travarCalendario }: {
  reg: (campo: NomeCampo) => UseFormRegisterReturn;
  erros: Partial<Record<NomeCampo, string>>;
  travarCalendario?: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Campo rotulo="Código" id="c-codigo" erro={erros.codigo} dica="Como na licença: ex. Cond. 3">
          <input id="c-codigo" className={inputCls} aria-invalid={!!erros.codigo} {...reg('codigo')} />
        </Campo>
        <Campo rotulo="Responsável" id="c-resp" erro={erros.responsavel}>
          <input id="c-resp" className={inputCls} aria-invalid={!!erros.responsavel} {...reg('responsavel')} />
        </Campo>
      </div>
      <Campo rotulo="Descrição da obrigação" id="c-desc" erro={erros.descricao}>
        <textarea id="c-desc" rows={3} className={inputCls} aria-invalid={!!erros.descricao} {...reg('descricao')} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Categoria" id="c-cat" erro={erros.categoria}>
          <select id="c-cat" className={inputCls} {...reg('categoria')}>
            {Object.entries(ROTULO_CATEGORIA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Periodicidade" id="c-per" erro={erros.periodicidade}>
          <select id="c-per" className={inputCls} disabled={travarCalendario} {...reg('periodicidade')}>
            {Object.entries(ROTULO_PERIODICIDADE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Vencimento" id="c-prazo" erro={erros.prazo}>
          <input id="c-prazo" type="date" className={inputCls} disabled={travarCalendario} aria-invalid={!!erros.prazo} {...reg('prazo')} />
        </Campo>
      </div>
      <Campo rotulo="Observação (opcional)" id="c-obs" erro={erros.observacao}>
        <textarea id="c-obs" rows={2} className={inputCls} {...reg('observacao')} />
      </Campo>
    </>
  );
}

/** Cadastro. A licença vem fixa quando a tela já está filtrada por uma. */
export function NovaCondicionanteModal({ licencas, usinasPorId, licencaId, onFechar }: {
  licencas: Licenca[]; usinasPorId: Map<string, Usina>; licencaId?: string; onFechar: () => void;
}) {
  const criar = useCriarCondicionante();
  const f = useForm<CondicionanteDados>({
    resolver: zodResolver(condicionanteSchema),
    defaultValues: { licencaId: licencaId ?? (licencas.length === 1 ? licencas[0].id : ''), codigo: '', descricao: '', categoria: 'relatorio', responsavel: '', periodicidade: 'mensal', prazo: '', observacao: '' },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = f;
  const salvar = handleSubmit(async (d) => {
    try {
      await criar.mutateAsync(d);
      onFechar();
    } catch (e) { mostrarErros(e, f.setError as never); }
  });
  return (
    <Modal titulo="Nova condicionante" onFechar={onFechar} largura="max-w-2xl">
      <form onSubmit={salvar} noValidate className="space-y-4">
        <Campo rotulo="Licença" id="c-licenca" erro={errors.licencaId?.message}>
          <select id="c-licenca" className={inputCls} disabled={!!licencaId} aria-invalid={!!errors.licencaId} {...register('licencaId')}>
            <option value="">Selecione…</option>
            {licencas.map((l) => <option key={l.id} value={l.id}>{l.tipo} · {l.numero} · {usinasPorId.get(l.usinaId)?.nome}</option>)}
          </select>
        </Campo>
        <CamposCondicionante reg={(campo) => register(campo)} erros={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v?.message]))} />
        <p className="text-xs text-slate-500">O vencimento informado é o primeiro; os próximos são calculados pelo sistema a cada cumprimento.</p>
        <Rodape salvando={isSubmitting} rotulo="Cadastrar condicionante" onFechar={onFechar} />
      </form>
    </Modal>
  );
}

/** Edição. Só os campos alterados são enviados; mudar prazo ou periodicidade reinicia o calendário (na API). */
export function EditarCondicionanteModal({ item, onFechar }: { item: Condicionante; onFechar: () => void }) {
  const editar = useEditarCondicionante();
  const cumprida = item.status === 'cumprida';
  const f = useForm<CondicionanteEdicao>({
    resolver: zodResolver(condicionanteEdicaoSchema),
    defaultValues: {
      codigo: item.codigo, descricao: item.descricao, categoria: item.categoria, responsavel: item.responsavel,
      periodicidade: item.periodicidade, prazo: item.prazo, observacao: item.observacao ?? '',
      ...(cumprida ? {} : { status: item.status as Exclude<Condicionante['status'], 'cumprida'> }),
    },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting, dirtyFields } } = f;
  const salvar = handleSubmit(async (d) => {
    const alterados = Object.fromEntries(Object.entries(d).filter(([campo]) => dirtyFields[campo as keyof CondicionanteEdicao])) as CondicionanteEdicao;
    if (Object.keys(alterados).length === 0) return onFechar();
    try {
      await editar.mutateAsync({ id: item.id, dados: alterados });
      onFechar();
    } catch (e) { mostrarErros(e, f.setError as never); }
  });
  return (
    <Modal titulo={`Editar ${item.codigo}`} onFechar={onFechar} largura="max-w-2xl">
      <form onSubmit={salvar} noValidate className="space-y-4">
        <CamposCondicionante reg={(campo) => register(campo)} travarCalendario={cumprida}
          erros={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v?.message]))} />
        <Campo rotulo="Situação" id="c-status" erro={errors.status?.message}
          dica={cumprida ? 'Cumprida: para mudar vencimento, periodicidade ou situação, desfaça o cumprimento no histórico.' : 'Encerre quando a obrigação deixar de valer; ela sai do acompanhamento.'}>
          {cumprida ? (
            <input id="c-status" className={inputCls} value={ROTULO_STATUS_CONDICIONANTE.cumprida} disabled readOnly />
          ) : (
            <select id="c-status" className={inputCls} {...register('status')}>
              {(['pendente', 'em_andamento', 'encerrada'] as const).map((s) => <option key={s} value={s}>{ROTULO_STATUS_CONDICIONANTE[s]}</option>)}
            </select>
          )}
        </Campo>
        {!cumprida && <p className="text-xs text-slate-500">Alterar o vencimento ou a periodicidade reinicia o calendário de prazos a partir da nova data. O histórico anterior é mantido.</p>}
        <Rodape salvando={isSubmitting} rotulo="Salvar alterações" onFechar={onFechar} />
      </form>
    </Modal>
  );
}

/** Registro de cumprimento do vencimento atual (data e observação). */
export function CumprimentoModal({ item, onFechar }: { item: Condicionante; onFechar: () => void }) {
  const registrar = useRegistrarCumprimento();
  const f = useForm<CumprimentoDados>({
    resolver: zodResolver(cumprimentoSchema),
    defaultValues: { prazoReferencia: item.prazo, cumpridaEm: hojeISO(), observacao: '' },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = f;
  const salvar = handleSubmit(async (d) => {
    try {
      await registrar.mutateAsync({ condicionanteId: item.id, dados: d });
      onFechar();
    } catch (e) { mostrarErros(e, f.setError as never); }
  });
  return (
    <Modal titulo={`Registrar cumprimento · ${item.codigo}`} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">
          Vencimento a cumprir: <strong>{formatarData(item.prazo)}</strong>
          {item.periodicidade !== 'unica' && ` (${ROTULO_PERIODICIDADE[item.periodicidade].toLowerCase()}: o próximo vencimento será calculado depois do registro)`}
        </p>
        {errors.prazoReferencia && <p role="alert" className="text-xs font-medium text-red-600">{errors.prazoReferencia.message}</p>}
        <Campo rotulo="Data do cumprimento" id="cp-data" erro={errors.cumpridaEm?.message}>
          <input id="cp-data" type="date" max={hojeISO()} className={inputCls} aria-invalid={!!errors.cumpridaEm} {...register('cumpridaEm')} />
        </Campo>
        <Campo rotulo="Observação (opcional)" id="cp-obs" erro={errors.observacao?.message} dica="Ex.: protocolo, ofício ou número do relatório enviado">
          <textarea id="cp-obs" rows={2} className={inputCls} {...register('observacao')} />
        </Campo>
        <Rodape salvando={isSubmitting} rotulo="Registrar cumprimento" onFechar={onFechar} />
      </form>
    </Modal>
  );
}

/** Formulário do motivo; a confirmação final é um segundo diálogo. */
function CancelarCumprimento({ condicionanteId, cumprimentoId, vencimento, onConcluir }: {
  condicionanteId: string; cumprimentoId: string; vencimento: string; onConcluir: () => void;
}) {
  const cancelar = useCancelarCumprimento();
  const [confirmando, setConfirmando] = useState<CancelamentoCumprimentoDados | null>(null);
  const f = useForm<CancelamentoCumprimentoDados>({
    resolver: zodResolver(cancelamentoCumprimentoSchema),
    defaultValues: { cumprimentoId, motivo: '' },
  });
  const { register, handleSubmit, formState: { errors } } = f;
  return (
    <>
    <form onSubmit={handleSubmit((d) => setConfirmando(d))} noValidate className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <Campo rotulo="Motivo do cancelamento" id="cc-motivo" erro={errors.motivo?.message} dica="Fica registrado no histórico, junto com quem cancelou e quando.">
        <textarea id="cc-motivo" rows={2} className={inputCls} aria-invalid={!!errors.motivo} {...register('motivo')} />
      </Campo>
      <div className="flex justify-end gap-2">
        <Button onClick={onConcluir}>Voltar</Button>
        <Button type="submit" variante="perigo">Continuar</Button>
      </div>
    </form>
      {confirmando && (
        <Confirmar perigo titulo="Desfazer cumprimento" rotulo="Desfazer cumprimento" carregando={cancelar.isPending}
          mensagem={`Desfazer o cumprimento do vencimento ${formatarData(vencimento)}? O registro não é apagado: fica no histórico como cancelado, e a condicionante volta a esse vencimento.`}
          onFechar={() => setConfirmando(null)}
          onConfirmar={() => cancelar.mutate({ condicionanteId, dados: confirmando }, {
            onSuccess: onConcluir,
            onError: (e) => { setConfirmando(null); mostrarErros(e, f.setError as never); },
          })} />
      )}
    </>
  );
}

/** Histórico completo (todos os calendários, cancelados incluídos). */
export function HistoricoModal({ item, podeDesfazer, onFechar }: { item: Condicionante; podeDesfazer: boolean; onFechar: () => void }) {
  const historico = useCumprimentos(item.id);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const lista = historico.data ?? [];
  const desfazivel = podeDesfazer ? cumprimentoDesfazivel(item, lista) : undefined;
  return (
    <Modal titulo={`Histórico de cumprimentos · ${item.codigo}`} onFechar={onFechar} largura="max-w-2xl">
      {historico.isPending ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : historico.isError ? (
        <ErroCarga onTentar={() => { void historico.refetch(); }} />
      ) : lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Nenhum cumprimento registrado.</p>
      ) : (
        <ol className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {lista.map((h) => (
            <li key={h.id} className={`rounded-xl border p-4 text-sm ${h.canceladoEm ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">
                  Vencimento {formatarData(h.prazoReferencia)}
                  {h.calendario !== item.calendario && <span className="ml-2 text-xs font-normal text-slate-500">(calendário anterior)</span>}
                </p>
                {h.canceladoEm ? <Badge cor="cinza">Cancelado</Badge> : <Badge cor="verde">Cumprido em {formatarData(h.cumpridaEm)}</Badge>}
              </div>
              {h.observacao && <p className="mt-1">{h.observacao}</p>}
              <p className="mt-1 text-xs text-slate-500">Registrado por {h.registradoPorNome} em {formatarDataHora(h.registradoEm)}</p>
              {h.canceladoEm && (
                <p className="mt-2 text-xs text-slate-600">
                  <strong>Cancelado</strong> por {h.canceladoPorNome ?? '—'} em {formatarDataHora(h.canceladoEm)}. Motivo: {h.motivoCancelamento}
                </p>
              )}
              {desfazivel?.id === h.id && (cancelando === h.id ? (
                <CancelarCumprimento condicionanteId={item.id} cumprimentoId={h.id} vencimento={h.prazoReferencia} onConcluir={() => setCancelando(null)} />
              ) : (
                <div className="mt-3">
                  <Button onClick={() => setCancelando(h.id)}><Undo2 className="size-4" aria-hidden />Desfazer este cumprimento</Button>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-6 flex justify-end"><Button onClick={onFechar}>Fechar</Button></div>
    </Modal>
  );
}
