import {
  MATERIALS,
  SEASONS,
  myDraftSchema,
  myDraftsResponseSchema,
  type DraftUpdateInput,
  type Material,
  type MyDraft,
  type MyDraftsResponse,
  type Season,
} from '@madiro/shared';
import {
  BottomSheetContent,
  ChevronRightIcon,
  Dialog,
  DialogTitle,
  PencilIcon,
  QueryBoundary,
  TrashIcon,
  api,
  cn,
  dayLabel,
} from '@madiro/web-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FieldCard, PillGroup } from '../../components/scan/fields';

export const Route = createFileRoute('/_app/my-drafts')({
  component: MyDraftsPage,
});

const draftLabel = (d: MyDraft) => `${d.style} · ${d.color} · р. ${d.size}`;

/**
 * The seller's own intake pairs (design flow 3, FR-S-13): drafts awaiting a
 * price can be edited (five identity fields) or deleted with confirmation;
 * admin-confirmed pairs are read-only «на складі» rows.
 */
function MyDraftsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MyDraft | null>(null);
  const [deleting, setDeleting] = useState<MyDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const drafts = useQuery({
    queryKey: ['me', 'drafts'],
    queryFn: async () =>
      myDraftsResponseSchema.parse(await api.get<MyDraftsResponse>('/me/drafts')),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
    void queryClient.invalidateQueries({ queryKey: ['me', 'summary'] });
  };
  const fail = () => {
    setToast(t('myDrafts.error'));
    setTimeout(() => setToast(null), 3000);
  };

  const update = useMutation({
    mutationFn: async ({ pairId, input }: { pairId: string; input: DraftUpdateInput }) =>
      myDraftSchema.parse(await api.patch(`/intake/${pairId}`, input)),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (pairId: string) => api.delete(`/intake/${pairId}`),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
    onError: fail,
  });

  const materialLabels: Record<Material, string> = {
    LEATHER: t('intake.materialLeather'),
    SUEDE: t('intake.materialSuede'),
  };
  const seasonLabels: Record<Season, string> = {
    NONE: t('intake.seasonNone'),
    BAIKA: t('intake.seasonBaika'),
    SHEEPSKIN: t('intake.seasonSheepskin'),
  };

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-4 pb-7">
      {toast && (
        <div className="fixed inset-x-0 top-4 z-30 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-page shadow-modal">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary"
        >
          <ChevronRightIcon size={16} className="rotate-180" />
        </Link>
        <h1 className="font-display text-[26px] font-semibold text-ink">{t('myDrafts.title')}</h1>
      </div>

      <QueryBoundary
        isPending={drafts.isPending}
        isError={drafts.isError}
        onRetry={() => void drafts.refetch()}
      >
        {drafts.data &&
          (drafts.data.items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-border bg-surface px-8 text-center text-[13.5px] leading-relaxed text-text-muted">
              {t('myDrafts.empty')}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                {drafts.data.items.map((draft) => {
                  const traits = [
                    draft.material ? materialLabels[draft.material].toLowerCase() : null,
                    draft.season && draft.season !== 'NONE'
                      ? seasonLabels[draft.season].toLowerCase()
                      : null,
                  ].filter(Boolean);
                  return (
                    <div
                      key={draft.pairId}
                      className="flex items-center justify-between rounded-[14px] border border-border bg-surface px-[18px] py-[15px]"
                    >
                      <div className="flex flex-col gap-[3px]">
                        <span className="text-[15px] font-bold text-ink">{draftLabel(draft)}</span>
                        <span className="text-xs text-text-muted">
                          {[dayLabel(draft.createdAt), ...traits].join(' · ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'rounded-[10px] px-[11px] py-[5px] text-[11.5px] font-bold',
                            draft.awaitingPrice
                              ? 'bg-[#f0e5cc] text-[#8a6d2b]'
                              : 'bg-[#e2ecdc] text-[#3c5c34]',
                          )}
                        >
                          {draft.awaitingPrice ? t('myDrafts.awaiting') : t('myDrafts.inStock')}
                        </span>
                        {draft.awaitingPrice && (
                          <>
                            <button
                              type="button"
                              aria-label={t('myDrafts.edit')}
                              onClick={() => setEditing(draft)}
                              className="text-text-muted"
                            >
                              <PencilIcon size={16} />
                            </button>
                            <button
                              type="button"
                              aria-label={t('myDrafts.delete')}
                              onClick={() => setDeleting(draft)}
                              className="text-[#a05c3b]"
                            >
                              <TrashIcon size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 text-center text-xs leading-relaxed text-text-faint">
                {t('myDrafts.footer')}
              </div>
            </>
          ))}
      </QueryBoundary>

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <BottomSheetContent>
            <DraftEditForm
              key={editing.pairId}
              draft={editing}
              saving={update.isPending}
              onSave={(input) => update.mutate({ pairId: editing.pairId, input })}
            />
          </BottomSheetContent>
        )}
      </Dialog>

      <Dialog open={deleting != null} onOpenChange={(open) => !open && setDeleting(null)}>
        {deleting && (
          <BottomSheetContent>
            <div className="flex flex-col items-center gap-4 px-6 pt-2 pb-7 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f5e5dc] text-[#a05c3b]">
                <TrashIcon size={20} />
              </span>
              <DialogTitle className="font-display text-[24px] font-semibold text-ink">
                {t('myDrafts.deleteTitle')}
              </DialogTitle>
              <p className="text-[13px] leading-relaxed text-text-secondary">
                {t('myDrafts.deleteBody', { label: draftLabel(deleting) })}
              </p>
              <div className="flex w-full flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(deleting.pairId)}
                  className="rounded-[14px] bg-[#a05c3b] p-[15px] text-base font-bold text-white disabled:opacity-50"
                >
                  {t('myDrafts.delete')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(null)}
                  className="p-1 text-[13px] font-semibold text-text-secondary"
                >
                  {t('myDrafts.cancel')}
                </button>
              </div>
            </div>
          </BottomSheetContent>
        )}
      </Dialog>
    </div>
  );
}

/** Edit sheet: the same five intake fields, prefilled from the draft. */
function DraftEditForm({
  draft,
  saving,
  onSave,
}: {
  draft: MyDraft;
  saving: boolean;
  onSave: (input: DraftUpdateInput) => void;
}) {
  const { t } = useTranslation();
  const [size, setSize] = useState(String(draft.size));
  const [color, setColor] = useState(draft.color);
  const [style, setStyle] = useState(draft.style);
  const [season, setSeason] = useState<Season>(draft.season ?? 'NONE');
  const [material, setMaterial] = useState<Material | null>(draft.material);

  const materialLabels: Record<Material, string> = {
    LEATHER: t('intake.materialLeather'),
    SUEDE: t('intake.materialSuede'),
  };
  const seasonLabels: Record<Season, string> = {
    NONE: t('intake.seasonNone'),
    BAIKA: t('intake.seasonBaika'),
    SHEEPSKIN: t('intake.seasonSheepskin'),
  };

  const sizeNum = Number(size);
  const valid =
    Number.isInteger(sizeNum) &&
    sizeNum >= 16 &&
    sizeNum <= 50 &&
    color.length > 0 &&
    style.length > 0;

  return (
    <div className="flex flex-col gap-4 px-6 pt-2 pb-7">
      <DialogTitle className="font-display text-[24px] font-semibold text-ink">
        {t('myDrafts.editTitle')}
      </DialogTitle>
      <div className="grid grid-cols-3 gap-2.5">
        <FieldCard label={t('intake.fieldSize')} value={size} onChange={setSize} />
        <FieldCard label={t('intake.fieldColor')} value={color} onChange={setColor} />
        <FieldCard label={t('intake.fieldStyle')} value={style} onChange={setStyle} />
      </div>
      <PillGroup
        label={t('intake.seasonLabel')}
        options={SEASONS}
        selected={season}
        optionLabel={(o) => seasonLabels[o]}
        onSelect={setSeason}
      />
      <PillGroup
        label={t('intake.materialLabel')}
        options={MATERIALS}
        selected={material}
        optionLabel={(o) => materialLabels[o]}
        onSelect={(o) => setMaterial((current) => (current === o ? null : o))}
      />
      <button
        type="button"
        disabled={!valid || saving}
        onClick={() =>
          onSave({
            size: sizeNum,
            color,
            style,
            season,
            ...(material ? { material } : {}),
          })
        }
        className="rounded-[14px] bg-ink p-[15px] text-base font-bold text-page disabled:opacity-50"
      >
        {t('myDrafts.save')}
      </button>
    </div>
  );
}
