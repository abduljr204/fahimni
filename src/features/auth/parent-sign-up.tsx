"use client";

import { Lock, Mail, Phone, School, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ADULT_AGE, MIN_CHILD_AGE } from "@/domain/accounts";
import { fieldErrors, parentSignUpSchema } from "@/domain/validation";
import { useI18n } from "@/i18n/i18n-provider";
import { getServices, isServiceError } from "@/services";

const LEVELS = ["secondary", "university_early"] as const;

/** Parent registers themselves and the younger student they'll manage, with consent. */
export function ParentSignUpForm({ next }: { next: string }) {
  const { t, fmt, href } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const year = new Date().getFullYear();
  const childYears = Array.from({ length: ADULT_AGE - MIN_CHILD_AGE }, (_, i) => year - MIN_CHILD_AGE - i);

  const messages: Record<string, string> = t.validation;
  const err = (key: string) => (errors[key] ? (key === "email" && errors[key] === "emailTaken" ? t.auth.emailTaken : (messages[errors[key]] ?? t.validation.required)) : undefined);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const raw = {
      fullName: f.fullName,
      email: f.email,
      password: f.password,
      phone: f.phone || undefined,
      child: { fullName: f.childName, level: f.level, school: f.school, studyYear: f.studyYear, birthYear: f.birthYear },
      acceptTerms,
      guardianConsent,
    };
    setAttempt((a) => a + 1);
    const parsed = parentSignUpSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await getServices().auth.signUpParent(raw as never);
      toast.success(fmt(t.auth.welcome, { name: parsed.data.fullName.split(" ")[0] }), t.demo.demoAccount);
      router.push(href(next));
    } catch (error) {
      if (isServiceError(error, "email_taken")) setErrors({ email: "emailTaken" });
      else if (isServiceError(error, "rate_limited")) toast.error(t.errors.rateLimited);
      else toast.error(t.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <p className="rounded-2xl bg-brand-50 p-3 text-[13px] text-brand-800">{t.auth.parentIntro}</p>
      <h2 className="pt-1 text-sm font-bold text-ink-700">{t.auth.parentDetails}</h2>
      <Input name="fullName" label={t.auth.fullName} autoComplete="name" icon={<UserRound className="size-4" />} error={err("fullName")} shakeKey={attempt} />
      <Input name="email" type="email" label={t.auth.email} autoComplete="email" inputMode="email" dir="ltr" icon={<Mail className="size-4" />} error={err("email")} shakeKey={attempt} />
      <Input name="password" type="password" label={t.auth.password} autoComplete="new-password" hint={t.auth.passwordHint} icon={<Lock className="size-4" />} error={err("password")} shakeKey={attempt} />
      <Input name="phone" type="tel" label={t.auth.phone} hint={t.auth.phoneHint} inputMode="tel" dir="ltr" autoComplete="tel" icon={<Phone className="size-4" />} error={err("phone")} shakeKey={attempt} />

      <h2 className="pt-3 text-sm font-bold text-ink-700">{t.auth.childDetails}</h2>
      <Input name="childName" label={t.auth.childName} icon={<UserRound className="size-4" />} error={err("child.fullName")} shakeKey={attempt} />
      <Input name="school" label={t.auth.school} placeholder={t.auth.schoolPlaceholder} icon={<School className="size-4" />} error={err("child.school")} shakeKey={attempt} />
      <div className="grid grid-cols-2 gap-3 [&>*:first-child]:col-span-2">
        <Select name="level" label={t.auth.level} defaultValue="secondary">
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {t.tutor.gradeLevelNames[l]}
            </option>
          ))}
        </Select>
        <Select name="studyYear" label={t.auth.grade} defaultValue="1">
          {[1, 2, 3, 4, 5, 6].map((y) => (
            <option key={y} value={y}>
              {fmt(t.auth.yearN, { n: y })}
            </option>
          ))}
        </Select>
        <Select name="birthYear" label={t.auth.childBirthYear} defaultValue={String(year - 16)} error={err("child.birthYear")} shakeKey={attempt}>
          {childYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-1 text-sm text-ink-600">
        <input type="checkbox" checked={guardianConsent} onChange={(e) => setGuardianConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
        <span className={errors.guardianConsent ? "text-coral-600" : undefined}>{t.auth.guardianConsent}</span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-1 text-sm text-ink-600">
        <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
        <span className={errors.acceptTerms ? "text-coral-600" : undefined}>
          {t.auth.acceptTerms} ·{" "}
          <AppLink href="/legal/terms" target="_blank" className="font-semibold text-brand-600 underline">
            {t.auth.readTerms}
          </AppLink>
        </span>
      </label>
      <Button type="submit" block size="lg" loading={loading}>
        {loading ? t.auth.signingUp : t.auth.signUp}
      </Button>
    </form>
  );
}
