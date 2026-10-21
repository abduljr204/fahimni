"use client";

import { motion } from "motion/react";
import { GraduationCap, LayoutDashboard, Lock, Mail, School, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useState, type FormEvent } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { LogoMark } from "@/components/illustrations/logo";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app-config";
import { fieldErrors, signInSchema, signUpSchema } from "@/domain/validation";
import { useRoleSwitch } from "@/features/demo/use-role-switch";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { isServiceError } from "@/services";

/** Only allow relative, in-app redirects to avoid open-redirect issues. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-6 pt-2 pb-6 text-center">
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16 }} className="inline-block">
        <LogoMark className="size-16" animated />
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 text-2xl font-extrabold">
        {title}
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-1.5 text-sm text-ink-500">
        {subtitle}
      </motion.p>
    </div>
  );
}

function DemoQuickAccess({ next }: { next: string }) {
  const { t, href } = useI18n();
  const { switchDemoRole } = useSession();
  const roles = useRoleSwitch();
  const router = useRouter();
  if (!appConfig.isPrototype || !switchDemoRole) return null;
  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 text-[12px] font-medium text-ink-400">
        <span className="h-px flex-1 bg-ink-200" />
        {t.auth.quickDemo}
        <span className="h-px flex-1 bg-ink-200" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          loading={roles.pending === "student"}
          onClick={async () => {
            await switchDemoRole("student");
            router.push(href(next));
          }}
        >
          <GraduationCap className="size-4 text-brand-600" /> {t.auth.demoStudent}
        </Button>
        <Button variant="outline" loading={roles.pending === "tutor"} onClick={() => roles.switchTo("tutor")}>
          <LayoutDashboard className="size-4 text-brand-600" /> {t.auth.demoTutor}
        </Button>
      </div>
      <p className="mt-3 text-center text-[12px] text-ink-400">{t.auth.demoPasswordHint}</p>
    </div>
  );
}

export function SignUpScreen({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = use(searchParams);
  const next = safeNext(rawNext);
  const { t, fmt, href } = useI18n();
  const { signUp } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const err = (key: string) => (errors[key] ? t.validation[errors[key] as keyof typeof t.validation] ?? t.validation.required : undefined);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const raw = { ...Object.fromEntries(form), acceptTerms };
    const parsed = signUpSchema.safeParse(raw);
    setAttempt((a) => a + 1);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await signUp(parsed.data);
      toast.success(fmt(t.auth.welcome, { name: parsed.data.fullName.split(" ")[0] }), t.demo.demoAccount);
      router.push(href(next));
    } catch (error) {
      if (isServiceError(error, "email_taken")) setErrors({ email: "emailTaken" });
      else toast.error(t.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen variant="push" withNav={false} className="pb-10">
      <TopBar transparent />
      <AuthHeader title={t.auth.signUpTitle} subtitle={t.auth.signUpSubtitle} />
      <motion.form
        noValidate
        onSubmit={onSubmit}
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.15 } } }}
        className="space-y-4 px-6"
      >
        {[
          <Input key="n" name="fullName" label={t.auth.fullName} autoComplete="name" icon={<UserRound className="size-4" />} error={err("fullName")} shakeKey={attempt} />,
          <Input key="e" name="email" type="email" label={t.auth.email} autoComplete="email" inputMode="email" dir="ltr" icon={<Mail className="size-4" />} error={errors.email === "emailTaken" ? t.auth.emailTaken : err("email")} shakeKey={attempt} />,
          <Input key="p" name="password" type="password" label={t.auth.password} autoComplete="new-password" hint={t.auth.passwordHint} icon={<Lock className="size-4" />} error={err("password")} shakeKey={attempt} />,
          <Input key="u" name="university" label={t.auth.university} placeholder={t.auth.universityPlaceholder} icon={<School className="size-4" />} error={err("university")} shakeKey={attempt} />,
          <div key="m" className="grid grid-cols-[1fr_auto] gap-3">
            <Input name="major" label={t.auth.major} placeholder={t.auth.majorPlaceholder} error={err("major")} shakeKey={attempt} />
            <Select name="studyYear" label={t.auth.studyYear} defaultValue="1" error={err("studyYear")} className="w-28">
              {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                <option key={y} value={y}>
                  {fmt(t.auth.yearN, { n: y })}
                </option>
              ))}
            </Select>
          </div>,
        ].map((field, i) => (
          <motion.div key={i} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
            {field}
          </motion.div>
        ))}

        <motion.label
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
          animate={errors.acceptTerms ? { x: [0, -6, 6, -3, 3, 0] } : undefined}
          key={`terms-${errors.acceptTerms ? attempt : 0}`}
          className="flex cursor-pointer items-start gap-3 rounded-2xl p-1 text-sm text-ink-600"
        >
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded-md accent-brand-600"
          />
          <span className={errors.acceptTerms ? "text-coral-600" : undefined}>{t.auth.acceptTerms}</span>
        </motion.label>

        <Button type="submit" block size="lg" loading={loading}>
          {loading ? t.auth.signingUp : t.auth.signUp}
        </Button>
        <p className="text-center text-sm text-ink-500">
          {t.auth.haveAccount}{" "}
          <AppLink href={`/auth/sign-in${rawNext ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-600">
            {t.auth.signIn}
          </AppLink>
        </p>
      </motion.form>
      <div className="px-6">
        <DemoQuickAccess next={next} />
      </div>
    </Screen>
  );
}

export function SignInScreen({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = use(searchParams);
  const next = safeNext(rawNext);
  const { t, fmt, l, href } = useI18n();
  const { signIn } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);

  const err = (key: string) => (errors[key] ? t.validation[errors[key] as keyof typeof t.validation] ?? t.validation.required : undefined);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = signInSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    setAttempt((a) => a + 1);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const session = await signIn(parsed.data);
      toast.success(fmt(t.auth.welcomeBack, { name: l(session.user.displayName).split(" ")[0] }));
      router.push(href(session.user.role === "tutor" && next === "/" ? "/tutor" : next));
    } catch (error) {
      if (isServiceError(error, "invalid_credentials")) setErrors({ _form: "invalid" });
      else toast.error(t.common.somethingWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen variant="push" withNav={false} className="pb-10">
      <TopBar transparent />
      <AuthHeader title={t.auth.signInTitle} subtitle={t.auth.signInSubtitle} />
      <form noValidate onSubmit={onSubmit} className="space-y-4 px-6">
        <Input name="email" type="email" label={t.auth.email} autoComplete="email" inputMode="email" dir="ltr" icon={<Mail className="size-4" />} error={err("email")} shakeKey={attempt} />
        <Input name="password" type="password" label={t.auth.password} autoComplete="current-password" icon={<Lock className="size-4" />} error={err("password")} shakeKey={attempt} />
        {errors._form && (
          <motion.p
            key={attempt}
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: [0, -6, 6, -3, 3, 0] }}
            className="rounded-2xl bg-coral-100 px-4 py-3 text-sm font-medium text-coral-600"
          >
            {t.auth.invalidCredentials}
          </motion.p>
        )}
        <Button type="submit" block size="lg" loading={loading}>
          {loading ? t.auth.signingIn : t.auth.signIn}
        </Button>
        <p className="text-center text-sm text-ink-500">
          {t.auth.noAccount}{" "}
          <AppLink href={`/auth/sign-up${rawNext ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-600">
            {t.auth.signUp}
          </AppLink>
        </p>
      </form>
      <div className="px-6">
        <DemoQuickAccess next={next} />
      </div>
    </Screen>
  );
}
