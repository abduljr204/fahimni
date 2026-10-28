"use client";

import { motion } from "motion/react";
import { FlaskConical, KeyRound, Lock, Mail, MailCheck } from "lucide-react";
import { use, useState, type FormEvent } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { fieldErrors, passwordResetRequestSchema, passwordResetSchema } from "@/domain/validation";
import { useI18n } from "@/i18n/i18n-provider";
import { getServices, isServiceError } from "@/services";

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="px-6 pt-2 pb-6 text-center">
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mx-auto grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-float"
      >
        {icon}
      </motion.span>
      <h1 className="mt-4 text-2xl font-extrabold">{title}</h1>
      <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
    </div>
  );
}

export function ForgotPasswordScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ demoResetPath?: string } | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = passwordResetRequestSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      setError(t.validation.emailInvalid);
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      setSent(await getServices().auth.requestPasswordReset(parsed.data.email));
    } catch (err) {
      toast.error(isServiceError(err, "rate_limited") ? t.errors.rateLimited : t.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen variant="push" withNav={false} className="pb-10">
      <TopBar transparent backHref="/auth/sign-in" />
      <Header icon={<KeyRound className="size-7" />} title={t.auth.forgotTitle} subtitle={t.auth.forgotSubtitle} />
      {sent ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 px-6">
          <p className="flex gap-3 rounded-2xl bg-mint-100 p-4 text-sm font-medium text-mint-600">
            <MailCheck className="size-5 shrink-0" /> {t.auth.resetSent}
          </p>
          {sent.demoResetPath && (
            <AppLink href={sent.demoResetPath} className="flex items-center justify-center gap-2 rounded-2xl bg-accent-100 p-3 text-sm font-semibold text-accent-600">
              <FlaskConical className="size-4" /> {t.auth.demoResetLink}
            </AppLink>
          )}
          <AppLink href="/auth/sign-in" className="block text-center text-sm font-semibold text-brand-600">
            {t.auth.signIn}
          </AppLink>
        </motion.div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-4 px-6">
          <Input name="email" type="email" label={t.auth.email} autoComplete="email" inputMode="email" dir="ltr" icon={<Mail className="size-4" />} error={error} />
          <Button type="submit" block size="lg" loading={loading}>
            {t.auth.sendResetLink}
          </Button>
        </form>
      )}
    </Screen>
  );
}

export function ResetPasswordScreen({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = use(searchParams);
  const { t } = useI18n();
  const toast = useToast();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const messages: Record<string, string> = t.validation;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    const parsed = passwordResetSchema.safeParse({ token, password });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setError(messages[errs.password ?? errs.token] ?? t.validation.required);
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await getServices().auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (isServiceError(err, "validation")) setError(t.validation.resetLinkInvalid);
      else toast.error(t.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen variant="push" withNav={false} className="pb-10">
      <TopBar transparent backHref="/auth/sign-in" />
      <Header icon={<Lock className="size-7" />} title={t.auth.resetTitle} subtitle={t.auth.resetSubtitle} />
      {done ? (
        <div className="space-y-4 px-6">
          <p className="flex gap-3 rounded-2xl bg-mint-100 p-4 text-sm font-medium text-mint-600">
            <MailCheck className="size-5 shrink-0" /> {t.auth.resetDone}
          </p>
          <AppLink href="/auth/sign-in" className="block">
            <Button block size="lg">
              {t.auth.signIn}
            </Button>
          </AppLink>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-4 px-6">
          <Input name="password" type="password" label={t.auth.newPassword} autoComplete="new-password" hint={t.auth.passwordHint} icon={<Lock className="size-4" />} error={error} />
          <Button type="submit" block size="lg" loading={loading}>
            {t.auth.savePassword}
          </Button>
        </form>
      )}
    </Screen>
  );
}
