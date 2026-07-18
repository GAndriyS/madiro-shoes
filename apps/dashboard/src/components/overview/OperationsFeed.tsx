import type { RecentOperation } from '@madiro/shared';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import { money, num, timeOf } from '@madiro/web-core';

const TYPE_KEY: Record<RecentOperation['type'], string> = {
  SALE: 'overview.opSale',
  RETURN: 'overview.opReturn',
  INTAKE: 'overview.opIntake',
  WRITEOFF: 'overview.opWriteoff',
};

/** Recent operations feed (design 1a — grid; 1c — stacked on mobile). */
export function OperationsFeed({ items }: { items: RecentOperation[] }) {
  const { t } = useTranslation();

  const label = (op: RecentOperation) =>
    `${op.style} · ${op.color} · р. ${op.size} — ${t(TYPE_KEY[op.type])}`;

  const seller = (op: RecentOperation) => {
    const parts = [op.sellerName];
    if (op.paymentMethod) {
      parts.push(t(op.paymentMethod === 'CASH' ? 'overview.payCash' : 'overview.payCard'));
    }
    if (op.isDraft) {
      parts.push(t('overview.draft'));
    }
    return parts.join(' · ');
  };

  const tone = (op: RecentOperation) => (op.type === 'RETURN' ? 'text-danger' : 'text-ink');

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface px-[18px] py-4 md:px-[22px] md:py-[18px]">
      <span className="text-[12.5px] font-extrabold text-ink md:text-[13px]">
        {t('overview.feedTitle')}
      </span>

      {/* Desktop/tablet: grid per design */}
      <div className="hidden grid-cols-[90px_1fr_130px_110px_90px] gap-1.5 text-[12.5px] tabular-nums md:grid">
        {items.map((op) => (
          <Fragment key={op.id}>
            <span className="text-text-muted">{timeOf(op.at)}</span>
            <span className={`font-bold ${tone(op)}`}>{label(op)}</span>
            <span>{seller(op)}</span>
            <span
              className={`text-right ${op.amount == null ? 'text-text-muted' : `font-bold ${tone(op)}`}`}
            >
              {op.amount == null ? t('common.noPrice') : money(op.amount)}
            </span>
            <span
              className={`text-right ${op.margin != null && op.margin < 0 ? 'text-danger' : 'text-success'}`}
            >
              {op.margin != null ? t('overview.margin', { value: num(op.margin) }) : ''}
            </span>
          </Fragment>
        ))}
      </div>

      {/* Mobile: stacked list (design 1c) */}
      <div className="flex flex-col md:hidden">
        {items.map((op, i) => (
          <div
            key={op.id}
            className={`flex items-baseline justify-between py-[7px] ${
              i < items.length - 1 ? 'border-b border-border-row' : ''
            }`}
          >
            <div className="flex flex-col">
              <span className={`text-[13px] font-bold ${tone(op)}`}>{label(op)}</span>
              <span className="text-[11px] text-text-muted">
                {timeOf(op.at)} · {seller(op)}
              </span>
            </div>
            <span
              className={`text-[13px] ${op.amount == null ? 'text-[11px] text-text-muted' : `font-bold ${tone(op)}`}`}
            >
              {op.amount == null ? t('common.noPrice') : money(op.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
