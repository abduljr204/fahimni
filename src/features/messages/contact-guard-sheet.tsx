"use client";

import { Eraser, PencilLine, ShieldCheck } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/overlays";
import { findingKinds, type ContactFinding } from "@/domain/contact-guard";
import { intlLocales } from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";

/** The message with every detected detail highlighted, so the sender sees exactly what to change. */
function Highlighted({ text, findings }: { text: string; findings: ContactFinding[] }) {
  const parts: { text: string; flagged: boolean }[] = [];
  let cursor = 0;
  for (const f of [...findings].sort((a, b) => a.index - b.index)) {
    if (f.index > cursor) parts.push({ text: text.slice(cursor, f.index), flagged: false });
    parts.push({ text: text.slice(f.index, f.index + f.length), flagged: true });
    cursor = f.index + f.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), flagged: false });
  return (
    <p className="rounded-2xl bg-ink-50 p-3 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-ink-700">
      {parts.map((p, i) =>
        p.flagged ? (
          <mark key={i} className="rounded bg-coral-100 px-0.5 font-semibold text-coral-600">
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </p>
  );
}

/**
 * Friendly warning shown before a pre-booking message with contact details is sent. The
 * sender can edit it, or let the app mask the details and send the rest.
 */
export function ContactGuardSheet({
  open,
  text,
  findings,
  onEdit,
  onRemoveAndSend,
}: {
  open: boolean;
  text: string;
  findings: ContactFinding[];
  onEdit: () => void;
  onRemoveAndSend: () => void;
}) {
  const { t, fmt, locale } = useI18n();
  const kinds = new Intl.ListFormat(intlLocales[locale], { type: "conjunction" }).format(findingKinds(findings).map((k) => t.messages.guardKinds[k]));
  const textFindings = findings.filter((f) => f.index + f.length <= text.length);

  return (
    <BottomSheet
      open={open}
      onClose={onEdit}
      title={t.messages.guardTitle}
      footer={
        <div className="grid gap-2">
          <Button block size="lg" onClick={onEdit} data-autofocus>
            <PencilLine className="size-4" /> {t.messages.guardEdit}
          </Button>
          {textFindings.length > 0 && (
            <Button block variant="ghost" onClick={onRemoveAndSend}>
              <Eraser className="size-4" /> {t.messages.guardRemove}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl bg-brand-50 p-3.5 text-[14px] text-brand-800">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" />
          <p>{fmt(t.messages.guardBody, { kinds })}</p>
        </div>
        {text && <Highlighted text={text} findings={textFindings} />}
      </div>
    </BottomSheet>
  );
}
