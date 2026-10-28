"use client";

import { AnimatePresence, motion } from "motion/react";
import { FileCheck2, FlaskConical, IdCard, Lock, Mail, Phone, Upload, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { BackChevron, Card, ForwardChevron } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app-config";
import { toMajor, toMinor } from "@/domain/money";
import type { TutorDocument } from "@/domain/types";
import { fieldErrors, tutorApplicationSchema, type AttachmentInput, type TutorApplicationInput } from "@/domain/validation";
import { StepProgress } from "@/features/booking/booking-steps";
import { formatBytes, toAttachment } from "@/features/messages/attachments";
import { useApplyAsTutor, usePlatformSettings } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { isServiceError } from "@/services";
import { emptyProfile, ProfileFields, TeachingFields, type ProfileDraft } from "./tutor-profile-fields";

/** Which form fields belong to each step, so errors are shown where they can be fixed. */
const STEP_FIELDS: string[][] = [
  ["fullName", "email", "password", "phone"],
  ["headline", "bio", "university", "city", "languages", "modes", "gradeLevels"],
  ["subjectIds", "qualifications", "hourlyRateMinor"],
  ["documents", "acceptTerms", "verificationConsent"],
];

function DocumentSlot({
  label,
  icon,
  file,
  onPick,
}: {
  label: string;
  icon: ReactNode;
  file?: AttachmentInput;
  onPick: (file: File) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ink-50 p-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-brand-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{label}</span>
        {file && (
          <span className="block truncate text-[12px] text-ink-500">
            {file.name} · {formatBytes(file.sizeBytes)}
          </span>
        )}
      </span>
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
      <Button size="sm" variant={file ? "outline" : "secondary"} onClick={() => input.current?.click()}>
        <Upload className="size-4" /> {file ? t.onboarding.replace : t.onboarding.upload}
      </Button>
    </div>
  );
}

function Application() {
  const { t, l, fmt, money, href, dir } = useI18n();
  const { session } = useSession();
  const toast = useToast();
  const router = useRouter();
  const apply = useApplyAsTutor();
  const { data: settings } = usePlatformSettings();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState({ fullName: "", email: "", password: "", phone: "" });
  const [profile, setProfile] = useState<ProfileDraft>(emptyProfile);
  const [rate, setRate] = useState("40");
  const [documents, setDocuments] = useState<Partial<Record<TutorDocument["kind"], AttachmentInput>>>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const messages: Record<string, string> = t.validation;
  const currency = settings?.minHourlyRate.currency ?? "LYD";

  const input = {
    ...account,
    phone: account.phone || undefined,
    ...profile,
    hourlyRateMinor: toMinor(Number(rate) || 0, currency),
    documents: (Object.entries(documents) as [TutorDocument["kind"], AttachmentInput][]).map(([kind, file]) => ({ kind, file })),
    acceptTerms,
    verificationConsent: consent,
  };

  /** Validates the whole application but only reports errors for the steps up to `upTo`. */
  const validate = (upTo: number) => {
    const parsed = tutorApplicationSchema.safeParse(input);
    const all = parsed.success ? {} : fieldErrors(parsed.error);
    const relevant = STEP_FIELDS.slice(0, upTo + 1).flat();
    const shown = Object.fromEntries(
      Object.entries(all)
        .filter(([key]) => relevant.includes(key.split(".")[0]))
        .map(([key, code]) => [key.split(".")[0], key === "email" && code === "emailTaken" ? t.auth.emailTaken : (messages[code] ?? t.validation.required)]),
    );
    setErrors(shown);
    return Object.keys(shown).length === 0;
  };

  const go = (next: number) => {
    if (next > step && !validate(step)) return;
    setErrors({});
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pick = async (kind: TutorDocument["kind"], file: File) => {
    const result = await toAttachment(file);
    if (result === "type") toast.error(t.messages.attachType);
    else if (result === "size") toast.error(t.messages.attachTooLarge);
    else setDocuments((d) => ({ ...d, [kind]: result }));
  };

  const submit = () => {
    if (!validate(3)) return;
    // Validated above; the service validates again.
    apply.mutate(input as TutorApplicationInput, {
      onSuccess: () => {
        toast.success(t.onboarding.submitted);
        router.push(href("/tutor"));
      },
      onError: (e) => {
        if (isServiceError(e, "email_taken")) {
          setStep(0);
          setErrors({ email: t.auth.emailTaken });
        } else if (isServiceError(e, "validation") && e.fields?.hourlyRateMinor) {
          setStep(2);
          setErrors({ hourlyRateMinor: messages.rateOutOfRange });
        } else if (isServiceError(e, "rate_limited")) toast.error(t.errors.rateLimited);
        else toast.error(t.common.somethingWrong);
      },
    });
  };

  const sign = dir === "rtl" ? -1 : 1;
  const limits = settings ? { min: money(settings.minHourlyRate), max: money(settings.maxHourlyRate) } : undefined;

  return (
    <>
      <StepProgress step={step} labels={t.onboarding.steps} />
      <div className="relative overflow-hidden px-5 pt-7 pb-36">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, x: 40 * sign }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 * sign }} transition={{ type: "spring", stiffness: 340, damping: 32 }}>
            {step === 0 && (
              <div className="space-y-4">
                <p className="rounded-2xl bg-brand-50 p-3 text-[13px] text-brand-800">
                  {session ? fmt(t.onboarding.signedInNote, { name: l(session.user.displayName) }) : t.onboarding.accountNote}
                </p>
                <Input label={t.auth.fullName} autoComplete="name" icon={<UserRound className="size-4" />} value={account.fullName} onChange={(e) => setAccount((a) => ({ ...a, fullName: e.target.value }))} error={errors.fullName} />
                <Input label={t.auth.email} type="email" dir="ltr" autoComplete="email" icon={<Mail className="size-4" />} value={account.email} onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))} error={errors.email} />
                <Input label={t.auth.password} type="password" autoComplete="new-password" hint={t.auth.passwordHint} icon={<Lock className="size-4" />} value={account.password} onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))} error={errors.password} />
                <Input label={t.auth.phone} type="tel" dir="ltr" hint={t.auth.phoneHint} icon={<Phone className="size-4" />} value={account.phone} onChange={(e) => setAccount((a) => ({ ...a, phone: e.target.value }))} error={errors.phone} />
              </div>
            )}
            {step === 1 && <ProfileFields draft={profile} onChange={(p) => setProfile((d) => ({ ...d, ...p }))} errors={errors} />}
            {step === 2 && (
              <div className="space-y-6">
                <TeachingFields draft={profile} onChange={(p) => setProfile((d) => ({ ...d, ...p }))} errors={errors} />
                <Input
                  label={`${t.onboarding.rate} (${currency})`}
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  min={settings ? toMajor(settings.minHourlyRate.amountMinor, currency) : 1}
                  max={settings ? toMajor(settings.maxHourlyRate.amountMinor, currency) : undefined}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  hint={limits ? fmt(t.onboarding.rateHint, limits) : undefined}
                  error={errors.hourlyRateMinor}
                />
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">{t.onboarding.documents}</h2>
                <p className="text-[13px] text-ink-500">{t.onboarding.documentsHint}</p>
                <DocumentSlot label={t.onboarding.identity} icon={<IdCard className="size-5" />} file={documents.identity} onPick={(f) => void pick("identity", f)} />
                <DocumentSlot label={t.onboarding.qualificationDoc} icon={<FileCheck2 className="size-5" />} file={documents.qualification} onPick={(f) => void pick("qualification", f)} />
                {errors.documents && <p className="text-[13px] font-medium text-coral-600">{errors.documents}</p>}
                <label className="flex cursor-pointer items-start gap-3 p-1 text-sm text-ink-600">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
                  <span className={errors.verificationConsent ? "text-coral-600" : undefined}>{t.onboarding.verificationConsent}</span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 p-1 text-sm text-ink-600">
                  <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
                  <span className={errors.acceptTerms ? "text-coral-600" : undefined}>
                    {t.auth.acceptTerms} ·{" "}
                    <AppLink href="/legal/terms" target="_blank" className="font-semibold text-brand-600 underline">
                      {t.auth.readTerms}
                    </AppLink>
                  </span>
                </label>
                {appConfig.isPrototype && (
                  <Card className="flex gap-2 bg-accent-100 p-3 text-[13px] font-medium text-accent-600 shadow-none">
                    <FlaskConical className="mt-0.5 size-4 shrink-0" /> {t.onboarding.demoHint}
                  </Card>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[var(--app-max-width)] px-3 pb-3">
        <div className="flex items-center gap-3 rounded-[26px] border border-white/60 bg-white/92 p-3 shadow-nav backdrop-blur-xl">
          {step > 0 && (
            <Button variant="outline" size="icon" className="h-12" onClick={() => go(step - 1)} aria-label={t.common.back}>
              <BackChevron className="size-5" />
            </Button>
          )}
          {step < 3 ? (
            <Button size="lg" className="h-12 flex-1" onClick={() => go(step + 1)}>
              {t.onboarding.next} <ForwardChevron className="size-4" />
            </Button>
          ) : (
            <Button size="lg" className="h-12 flex-1" loading={apply.isPending} onClick={submit}>
              {t.onboarding.submit}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export function BecomeTutorScreen() {
  const { t } = useI18n();
  return (
    <Screen variant="push" withNav={false}>
      <TopBar title={t.onboarding.title} backHref="/" />
      <p className="-mt-2 px-5 pb-5 text-center text-sm text-ink-500">{t.onboarding.subtitle}</p>
      <Application />
    </Screen>
  );
}
