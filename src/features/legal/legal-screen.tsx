"use client";

import { FileWarning } from "lucide-react";
import { use } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { LEGAL, LEGAL_DOCS, LEGAL_UPDATED, type LegalDoc } from "./content";

export function LegalScreen({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = use(params);
  const { t, locale, fmt, date } = useI18n();
  const known = (LEGAL_DOCS as string[]).includes(doc);
  const sections = known ? LEGAL[doc as LegalDoc][locale] : [];

  return (
    <Screen variant="push" withNav={false} className="pb-10">
      <TopBar title={known ? t.legal[doc as LegalDoc] : " "} backHref="/profile" />
      {!known ? (
        <EmptyState icon={<FileWarning />} title={t.errors.notFoundTitle} />
      ) : (
        <div className="space-y-4 px-5">
          <p className="flex items-start gap-2 rounded-2xl bg-accent-100 p-3 text-[13px] font-medium text-accent-600">
            <FileWarning className="mt-0.5 size-4 shrink-0" /> {t.legal.draftNotice}
          </p>
          <nav className="flex gap-2 overflow-x-auto">
            {LEGAL_DOCS.map((d) => (
              <AppLink
                key={d}
                href={`/legal/${d}`}
                className={cn("shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold", d === doc ? "bg-ink-900 text-white" : "bg-white text-ink-700 shadow-card")}
              >
                {t.legal[d]}
              </AppLink>
            ))}
          </nav>
          <Card className="space-y-5 p-5">
            {sections.map((s) => (
              <section key={s.heading}>
                <h2 className="text-[16px] font-bold">{s.heading}</h2>
                {s.body.map((p, i) => (
                  <p key={i} className="mt-1.5 text-[14px] leading-relaxed text-ink-700">
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </Card>
          <p className="text-center text-[12px] text-ink-400">{fmt(t.legal.updated, { date: date(LEGAL_UPDATED) })}</p>
        </div>
      )}
    </Screen>
  );
}
