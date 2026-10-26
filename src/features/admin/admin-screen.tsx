"use client";

import { AnimatePresence, motion } from "motion/react";
import { Banknote, CalendarCheck, FlaskConical, Info, Landmark, Percent, ReceiptText, ShieldCheck, Smartphone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/data-viz";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Badge, Card, SectionHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { brand } from "@/config/app-config";
import { money as toMoney, toMajor, toMinor } from "@/domain/money";
import { bpsToPercent, isRateWithinLimits, percentToBps, priceLesson } from "@/domain/pricing";
import type { Money, PlatformSettings } from "@/domain/types";
import { fieldErrors, platformSettingsSchema } from "@/domain/validation";
import { SignInPrompt } from "@/features/auth/auth-gate";
import { useRoleSwitch } from "@/features/demo/use-role-switch";
import { useAdminOverview, usePlatformSettings, useTutorSearch, useUpdatePlatformSettings } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { fadeUp, stagger } from "@/lib/motion";

/** Students and tutors who open the admin area are offered the demo admin account. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { status, role } = useSession();
  const roles = useRoleSwitch();
  if (status === "loading") return <Skeleton className="mx-5 mt-6 h-40 rounded-3xl" />;
  if (status === "guest" && !roles.available) return <SignInPrompt />;
  if (role !== "admin") {
    return (
      <div className="px-5 pt-4">
        <Card className="p-6 text-center">
          <ShieldCheck className="mx-auto size-10 text-brand-500" />
          <p className="mt-4 text-lg font-extrabold">{t.admin.notAdminTitle}</p>
          <p className="mt-1.5 text-sm text-ink-500">{t.admin.notAdminBody}</p>
          {roles.available && (
            <Button className="mt-5" loading={roles.pending === "admin"} onClick={() => roles.switchTo("admin")}>
              {t.admin.switchToAdmin}
            </Button>
          )}
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}

function AmountTile({ icon, label, value, tone }: { icon: ReactNode; label: string; value: Money; tone: string }) {
  const { money } = useI18n();
  return (
    <motion.div variants={fadeUp}>
      <Card className="h-full p-4">
        <span className={`grid size-10 place-items-center rounded-2xl ${tone}`}>{icon}</span>
        <p className="mt-3 text-xl font-extrabold tabular-nums">{money(value, { compact: true })}</p>
        <p className="mt-0.5 text-[12px] text-ink-500">{label}</p>
      </Card>
    </motion.div>
  );
}

function Overview() {
  const { t, money, number } = useI18n();
  const { data, isLoading } = useAdminOverview();
  if (isLoading || !data) return <Skeleton className="mx-5 h-64 rounded-[28px]" />;

  return (
    <section className="px-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-ink-800 via-ink-900 to-brand-900 p-5 text-white shadow-float"
      >
        <motion.span className="absolute -end-12 -top-12 size-44 rounded-full bg-white/10" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 7, repeat: Infinity }} />
        <div className="relative flex items-start justify-between">
          <p className="text-sm text-white/75">{t.admin.commissionEarned}</p>
          <Badge tone="dark" className="bg-white/15">
            <FlaskConical className="size-3" /> {t.admin.simulatedPayments}
          </Badge>
        </div>
        <p className="relative mt-2 text-4xl font-extrabold tracking-tight tabular-nums">{money(data.commissionEarned)}</p>
        <p className="relative mt-2 text-[13px] text-white/70">
          {t.admin.grossVolume}: {money(data.grossVolume, { compact: true })}
        </p>
      </motion.div>

      <motion.div variants={stagger(0.07, 0.15)} initial="hidden" animate="show" className="mt-4 grid grid-cols-2 gap-3">
        <motion.div variants={fadeUp}>
          <Card className="h-full p-4">
            <span className="grid size-10 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <CalendarCheck className="size-5" />
            </span>
            <AnimatedNumber value={data.lessonCount} format={(n) => number(Math.round(n))} className="mt-3 block text-xl font-extrabold" />
            <p className="mt-0.5 text-[12px] text-ink-500">{t.admin.lessons}</p>
          </Card>
        </motion.div>
        <AmountTile icon={<Landmark className="size-5" />} label={t.admin.grossVolume} value={data.grossVolume} tone="bg-accent-100 text-accent-600" />
        <AmountTile icon={<Smartphone className="size-5" />} label={t.admin.collectedInApp} value={data.collectedInApp} tone="bg-mint-100 text-mint-600" />
        <AmountTile icon={<Banknote className="size-5" />} label={t.admin.paidInCash} value={data.paidInCash} tone="bg-coral-100 text-coral-600" />
      </motion.div>
    </section>
  );
}

/** Empty text is NaN so it fails validation instead of silently becoming 0. */
const parseNumber = (text: string) => (text.trim() === "" ? NaN : Number(text));

function SettingsEditor() {
  const { data: settings } = usePlatformSettings();
  if (!settings) return <Skeleton className="mx-5 h-80 rounded-3xl" />;
  // Remount after saving so the form starts from the stored values.
  return <SettingsForm key={settings.updatedAt} settings={settings} />;
}

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const { t, fmt, money, plural, date, currencySymbol } = useI18n();
  const toast = useToast();
  const save = useUpdatePlatformSettings();
  const { data: tutors = [] } = useTutorSearch({});
  const currency = brand.currency;

  const [commission, setCommission] = useState(String(bpsToPercent(settings.commissionBps)));
  const [minText, setMinText] = useState(String(toMajor(settings.minHourlyRate.amountMinor, currency)));
  const [maxText, setMaxText] = useState(String(toMajor(settings.maxHourlyRate.amountMinor, currency)));
  const [submitted, setSubmitted] = useState(0);

  const input = {
    commissionBps: percentToBps(parseNumber(commission)),
    minHourlyRateMinor: toMinor(parseNumber(minText), currency),
    maxHourlyRateMinor: toMinor(parseNumber(maxText), currency),
  };
  const parsed = platformSettingsSchema.safeParse(input);
  const errors = parsed.success ? {} : fieldErrors(parsed.error);
  const message = (field: keyof typeof input) => {
    const key = errors[field];
    if (!key || submitted === 0) return undefined;
    const messages: Record<string, string> = t.validation;
    return messages[key] ?? t.validation.required;
  };
  const dirty =
    input.commissionBps !== settings.commissionBps ||
    input.minHourlyRateMinor !== settings.minHourlyRate.amountMinor ||
    input.maxHourlyRateMinor !== settings.maxHourlyRate.amountMinor;

  const example = parsed.success
    ? priceLesson({ hourlyRate: toMoney(50, currency), durationMinutes: 60, mode: "online", commissionBps: input.commissionBps })
    : undefined;
  const outside = parsed.success
    ? tutors.filter(
        (tutor) =>
          !isRateWithinLimits(tutor.hourlyRate, {
            minHourlyRate: { currency, amountMinor: input.minHourlyRateMinor },
            maxHourlyRate: { currency, amountMinor: input.maxHourlyRateMinor },
          }),
      ).length
    : 0;

  const submit = () => {
    setSubmitted((n) => n + 1);
    if (!parsed.success) return;
    save.mutate(parsed.data, {
      onSuccess: () => toast.success(t.admin.saved),
      onError: () => toast.error(t.common.somethingWrong),
    });
  };

  return (
    <section className="px-5 pt-8">
      <SectionHeader title={t.admin.settings} action={<Percent className="size-5 text-ink-400" />} />
      <Card className="space-y-4 p-5">
        <Input
          label={`${t.admin.commission} (%)`}
          hint={t.admin.commissionHint}
          error={message("commissionBps")}
          shakeKey={submitted}
          type="number"
          inputMode="decimal"
          min={0}
          max={50}
          step={0.5}
          dir="ltr"
          value={commission}
          onChange={(e) => setCommission(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`${t.admin.minRate} (${currencySymbol(currency)})`}
            error={message("minHourlyRateMinor")}
            shakeKey={submitted}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            dir="ltr"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
          />
          <Input
            label={`${t.admin.maxRate} (${currencySymbol(currency)})`}
            error={message("maxHourlyRateMinor")}
            shakeKey={submitted}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            dir="ltr"
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
          />
        </div>

        <AnimatePresence mode="wait">
          {example && (
            <motion.p key={example.commission.amountMinor} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-2xl bg-ink-50 p-3 text-[13px] font-medium text-ink-700">
              {fmt(t.admin.example, { total: money(example.total), commission: money(example.commission), tutor: money(example.tutorEarnings) })}
            </motion.p>
          )}
        </AnimatePresence>
        {parsed.success && (
          <p className={`text-[13px] font-medium ${outside > 0 ? "text-coral-600" : "text-mint-600"}`}>{plural(t.admin.outsideLimits, outside)}</p>
        )}

        <div className="flex gap-2.5 rounded-2xl bg-brand-50 p-3.5 text-[13px] text-brand-800">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
          {t.admin.onlyNew}
        </div>

        <Button block size="lg" disabled={!dirty} loading={save.isPending} onClick={submit}>
          {t.common.save}
        </Button>
        <p className="text-center text-[12px] text-ink-400">{fmt(t.admin.updated, { date: date(settings.updatedAt) })}</p>
      </Card>
    </section>
  );
}

function RecentPayments() {
  const { t, l, money, shortDate } = useI18n();
  const { data } = useAdminOverview();
  if (!data) return null;

  return (
    <section className="px-5 pt-8">
      <SectionHeader title={t.admin.payments} action={<ReceiptText className="size-5 text-ink-400" />} />
      {data.recentPayments.length === 0 ? (
        <Card>
          <EmptyState icon={<ReceiptText />} title={t.admin.noPayments} className="py-7" />
        </Card>
      ) : (
        <Card className="divide-y divide-ink-100 overflow-hidden">
          {data.recentPayments.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                {p.purpose === "lesson" ? <Smartphone className="size-4" /> : <Banknote className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{t.admin.purpose[p.purpose]}</p>
                <p className="truncate text-[12px] text-ink-500">
                  {l(p.studentName)} → {l(p.tutorName)} · {shortDate(p.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`text-sm font-bold tabular-nums ${p.status === "refunded" ? "text-ink-400 line-through" : ""}`}>{money(p.amount)}</span>
                <div className="flex gap-1">
                  {p.provider === "simulated" && <Badge tone="accent">{t.demo.simulated}</Badge>}
                  <Badge tone={p.status === "succeeded" ? "mint" : p.status === "refunded" ? "ink" : "coral"}>{t.admin.paymentStatus[p.status]}</Badge>
                </div>
              </div>
            </motion.div>
          ))}
        </Card>
      )}
    </section>
  );
}

export function AdminScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <PageTitle title={t.admin.title} subtitle={t.admin.subtitle} />
      <AdminOnly>
        <Overview />
        <SettingsEditor />
        <RecentPayments />
      </AdminOnly>
    </Screen>
  );
}
