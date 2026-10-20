import { AlertIcon } from '@madiro/web-core';

interface OutcomeUnknownProps {
  title: string;
  body: string;
}

/**
 * A write that got no answer (spec §5.2). Not «не вдалося зберегти»: the
 * request may well have gone through, and a seller who believes it failed
 * rescans and sells the next identical pair. It stays on screen until the
 * retry it asks for — a toast would be gone before the customer is.
 */
export function OutcomeUnknown({ title, body }: OutcomeUnknownProps) {
  return (
    <div
      role="alert"
      data-testid="outcome-unknown"
      className="flex items-start gap-3 rounded-xl border border-dashed border-amber-border bg-amber-bg px-4 py-3"
    >
      <AlertIcon size={18} className="mt-0.5 flex-none text-amber-text" />
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-amber-text">{title}</span>
        <span className="text-[12.5px] leading-snug text-amber-text">{body}</span>
      </div>
    </div>
  );
}
