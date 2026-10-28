"use client";

import { Bell, FileText, Flag, FlaskConical, KeyRound, Mail, MessageSquareText, Phone, Smartphone, Trash2, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { AppLink } from "@/components/layout/app-link";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { BottomSheet } from "@/components/ui/overlays";
import { Badge, Card, ForwardChevron, SectionHeader, Skeleton, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app-config";
import { ADULT_AGE, MIN_CHILD_AGE } from "@/domain/accounts";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "@/domain/notifications";
import type { NotificationChannel, OutboundMessage } from "@/domain/types";
import { accountProfileSchema, changePasswordSchema, childSchema, fieldErrors } from "@/domain/validation";
import { AuthGate } from "@/features/auth/auth-gate";
import { setActiveChild } from "@/hooks/use-active-child";
import {
  useActingStudentId,
  useAddChild,
  useChangePassword,
  useDeleteAccount,
  useDeliveries,
  useMyReports,
  usePreferences,
  useUpdateAccountProfile,
  useUpdatePreferences,
} from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { isServiceError, type ServiceError } from "@/services";

/** Turns a service error's field codes into localized messages. */
function useFieldMessages() {
  const { t } = useI18n();
  const messages: Record<string, string> = t.validation;
  return (fields?: Record<string, string>) =>
    Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, messages[v] ?? t.validation.required]));
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="px-5 pt-6">
      <SectionHeader title={title} action={<span className="text-ink-400">{icon}</span>} />
      <Card className="p-4">{children}</Card>
    </section>
  );
}

// ─── Personal details ───────────────────────────────────────────────────────

function PersonalSection() {
  const { t, l, fmt } = useI18n();
  const { session } = useSession();
  const toast = useToast();
  const update = useUpdateAccountProfile();
  const toMessages = useFieldMessages();
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!session) return null;
  const student = session.user.role === "student" ? session.student : undefined;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const raw = { fullName: f.fullName, phone: f.phone || undefined, university: f.university, major: f.major, studyYear: f.studyYear };
    const parsed = accountProfileSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(toMessages(fieldErrors(parsed.error)));
      return;
    }
    setErrors({});
    update.mutate(raw, {
      onSuccess: () => toast.success(t.settings.saved),
      onError: (err) => (isServiceError(err, "validation") ? setErrors(toMessages((err as ServiceError).fields)) : toast.error(t.common.somethingWrong)),
    });
  };

  return (
    <Section title={t.settings.personal} icon={<UserRound className="size-5" />}>
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <Input name="fullName" label={t.auth.fullName} defaultValue={l(session.user.displayName)} error={errors.fullName} />
        <Input name="email" label={t.auth.email} value={session.user.email} disabled dir="ltr" readOnly icon={<Mail className="size-4" />} />
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          label={t.auth.phone}
          hint={t.auth.phoneHint}
          defaultValue={session.user.phone?.replace(/^\+218/, "0") ?? ""}
          icon={<Phone className="size-4" />}
          error={errors.phone}
        />
        {student && (
          <>
            <Input name="university" label={t.auth.university} defaultValue={l(student.university)} error={errors.university} />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Input name="major" label={t.auth.major} defaultValue={l(student.major)} error={errors.major} />
              <Select name="studyYear" label={t.auth.studyYear} defaultValue={String(student.studyYear)} className="w-28">
                {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                  <option key={y} value={y}>
                    {fmt(t.auth.yearN, { n: y })}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
        <Button type="submit" block loading={update.isPending}>
          {t.settings.saveChanges}
        </Button>
      </form>
    </Section>
  );
}

// ─── Children (parents) ─────────────────────────────────────────────────────

function ChildrenSection() {
  const { t, l, fmt } = useI18n();
  const { session } = useSession();
  const toast = useToast();
  const active = useActingStudentId();
  const add = useAddChild();
  const toMessages = useFieldMessages();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (session?.user.role !== "parent") return null;
  const year = new Date().getFullYear();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const raw = { fullName: f.childName, level: f.level as "secondary", school: f.school, studyYear: Number(f.studyYear), birthYear: Number(f.birthYear) };
    const parsed = childSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(toMessages(fieldErrors(parsed.error)));
      return;
    }
    add.mutate(parsed.data, {
      onSuccess: (child) => {
        toast.success(t.settings.childAdded);
        setActiveChild(child.userId);
        setOpen(false);
        setErrors({});
      },
      onError: () => toast.error(t.common.somethingWrong),
    });
  };

  return (
    <Section title={t.settings.children} icon={<Users className="size-5" />}>
      <ul className="space-y-2">
        {session.managedStudents?.map((child) => (
          <li key={child.userId} className="flex items-center gap-3 rounded-2xl bg-ink-50 p-3">
            <Avatar name={l(child.displayName)} hue={child.avatarHue} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{l(child.displayName)}</span>
              {child.level && <span className="text-[12px] text-ink-500">{t.tutor.gradeLevelNames[child.level]}</span>}
            </span>
            {child.userId === active ? (
              <Badge tone="mint">{t.settings.active}</Badge>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setActiveChild(child.userId)}>
                {t.settings.makeActive}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="outline" block className="mt-3" onClick={() => setOpen(true)}>
        {t.settings.addChild}
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t.settings.addChild}>
        <form noValidate onSubmit={onSubmit} className="space-y-4 pb-2">
          <Input name="childName" label={t.auth.childName} error={errors.fullName} />
          <Input name="school" label={t.auth.school} placeholder={t.auth.schoolPlaceholder} error={errors.school} />
          <div className="grid grid-cols-2 gap-3 [&>*:first-child]:col-span-2">
            <Select name="level" label={t.auth.level} defaultValue="secondary">
              {(["secondary", "university_early"] as const).map((lv) => (
                <option key={lv} value={lv}>
                  {t.tutor.gradeLevelNames[lv]}
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
            <Select name="birthYear" label={t.auth.childBirthYear} defaultValue={String(year - 14)} error={errors.birthYear}>
              {Array.from({ length: ADULT_AGE - MIN_CHILD_AGE }, (_, i) => year - MIN_CHILD_AGE - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" block size="lg" loading={add.isPending}>
            {t.settings.addChild}
          </Button>
        </form>
      </BottomSheet>
    </Section>
  );
}

// ─── Notifications ──────────────────────────────────────────────────────────

const subscribeNoop = () => () => {};
function useNotificationPermission(): NotificationPermission | "unsupported" {
  return useSyncExternalStore(
    subscribeNoop,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unsupported",
  );
}

function NotificationsSection() {
  const { t } = useI18n();
  const { session } = useSession();
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const permission = useNotificationPermission();
  const [, force] = useState(0);
  const icons: Record<NotificationChannel, ReactNode> = {
    email: <Mail className="size-4" />,
    sms: <MessageSquareText className="size-4" />,
    push: <Smartphone className="size-4" />,
  };

  return (
    <Section title={t.settings.notifications} icon={<Bell className="size-5" />}>
      <p className="mb-3 text-[13px] text-ink-500">{t.settings.notificationsHint}</p>
      {!prefs ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          {NOTIFICATION_CHANNELS.map((channel) => {
            const disabled = channel === "sms" && !session?.user.phone;
            return (
              <div key={channel} className="rounded-2xl bg-ink-50 p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                  {icons[channel]} {t.settings.channels[channel]}
                </p>
                {disabled && <p className="mb-2 text-[12px] text-ink-500">{t.settings.smsNeedsPhone}</p>}
                {channel === "push" && (
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-ink-500">
                      {permission === "granted"
                        ? t.settings.pushEnabled
                        : permission === "denied"
                          ? t.settings.pushBlocked
                          : permission === "unsupported"
                            ? t.settings.pushUnsupported
                            : ""}
                    </span>
                    {permission === "default" && (
                      <Button size="sm" variant="secondary" onClick={() => void Notification.requestPermission().then(() => force((n) => n + 1))}>
                        {t.settings.pushEnable}
                      </Button>
                    )}
                  </div>
                )}
                <ul className="divide-y divide-ink-100">
                  {NOTIFICATION_CATEGORIES.map((category) => (
                    <li key={category} className="flex items-center justify-between py-2 text-[14px]">
                      <span className={disabled ? "text-ink-400" : undefined}>{t.settings.categories[category]}</span>
                      <Switch
                        checked={!disabled && prefs[channel][category]}
                        label={`${t.settings.channels[channel]} · ${t.settings.categories[category]}`}
                        onChange={(on) => !disabled && update.mutate({ ...prefs, [channel]: { ...prefs[channel], [category]: on } })}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function DeliveryText({ item }: { item: OutboundMessage }) {
  const { t, l, fmt } = useI18n();
  if (item.type === "password_reset") return <>{t.settings.passwordResetEmail}</>;
  return <>{fmt(t.notifications.types[item.type], { name: l(item.data.name), subject: l(item.data.subject) })}</>;
}

function DeliveriesSection() {
  const { t, chatTime } = useI18n();
  const { data = [], isLoading } = useDeliveries();
  const icons: Record<NotificationChannel, ReactNode> = {
    email: <Mail className="size-3.5" />,
    sms: <MessageSquareText className="size-3.5" />,
    push: <Smartphone className="size-3.5" />,
  };
  return (
    <Section title={t.settings.deliveries} icon={<Mail className="size-5" />}>
      <p className="mb-3 text-[13px] text-ink-500">{t.settings.deliveriesHint}</p>
      {appConfig.isPrototype && (
        <p className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-accent-600">
          <FlaskConical className="size-3.5" /> {t.settings.deliveriesDemo}
        </p>
      )}
      {isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : data.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-ink-400">{t.settings.noDeliveries}</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {data.map((d) => (
            <li key={d.id} className="flex items-start gap-2.5 rounded-2xl bg-ink-50 p-2.5 text-[13px]">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-white text-brand-600">{icons[d.channel]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-ink-800">
                  <DeliveryText item={d} />
                </span>
                <span className="text-[11px] text-ink-400" dir="ltr">
                  {t.settings.channels[d.channel]} → {d.channel === "push" ? "📱" : d.to} · {chatTime(d.createdAt)}
                </span>
                {d.data.link && (
                  <AppLink href={d.data.link} className="mt-1 block text-[12px] font-semibold text-brand-600">
                    {t.auth.demoResetLink}
                  </AppLink>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── Password ───────────────────────────────────────────────────────────────

function PasswordSection() {
  const { t } = useI18n();
  const toast = useToast();
  const change = useChangePassword();
  const toMessages = useFieldMessages();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form)) as { currentPassword: string; newPassword: string };
    const parsed = changePasswordSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(toMessages(fieldErrors(parsed.error)));
      return;
    }
    setErrors({});
    change.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(t.settings.passwordChanged);
        form.reset();
      },
      onError: (err) => (isServiceError(err, "validation") ? setErrors(toMessages((err as ServiceError).fields)) : toast.error(t.common.somethingWrong)),
    });
  };

  return (
    <Section title={t.settings.passwordSection} icon={<KeyRound className="size-5" />}>
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <Input name="currentPassword" type="password" autoComplete="current-password" label={t.settings.currentPassword} error={errors.currentPassword} />
        <Input name="newPassword" type="password" autoComplete="new-password" label={t.auth.newPassword} hint={t.auth.passwordHint} error={errors.newPassword} />
        <Button type="submit" variant="secondary" block loading={change.isPending}>
          {t.settings.changePassword}
        </Button>
      </form>
    </Section>
  );
}

// ─── Reports, legal, delete ─────────────────────────────────────────────────

function ReportsSection() {
  const { t, chatTime } = useI18n();
  const { data = [] } = useMyReports();
  const tone = { open: "accent", resolved: "mint", dismissed: "ink" } as const;
  return (
    <Section title={t.settings.myReports} icon={<Flag className="size-5" />}>
      {data.length === 0 ? (
        <p className="text-center text-[13px] text-ink-400">{t.settings.noReports}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-2xl bg-ink-50 p-3 text-[13px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {r.kind === "dispute" ? t.report.disputeReasons[r.reason as keyof typeof t.report.disputeReasons] : t.report.reasons[r.reason as keyof typeof t.report.reasons]}
                </span>
                <span className="text-ink-500">
                  {t.admin.reportKinds[r.kind]} · {chatTime(r.createdAt)}
                </span>
                {r.resolution?.note && r.status !== "open" && <span className="mt-1 block text-ink-600">{r.resolution.note}</span>}
              </span>
              <Badge tone={tone[r.status]}>{t.settings.reportStatus[r.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function LegalSection() {
  const { t } = useI18n();
  return (
    <Section title={t.settings.legal} icon={<FileText className="size-5" />}>
      <div className="divide-y divide-ink-100">
        {(["terms", "privacy", "refunds"] as const).map((doc) => (
          <AppLink key={doc} href={`/legal/${doc}`} className="flex items-center justify-between py-2.5 text-[14px] font-medium">
            {t.legal[doc]}
            <ForwardChevron className="size-4 text-ink-400" />
          </AppLink>
        ))}
      </div>
    </Section>
  );
}

function DeleteSection() {
  const { t, href } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const remove = useDeleteAccount();
  const toMessages = useFieldMessages();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();

  const confirm = () =>
    remove.mutate(email.trim().toLowerCase(), {
      onSuccess: () => {
        toast.info(t.settings.deleted);
        router.push(href("/"));
      },
      onError: (err) => {
        const msgs = isServiceError(err, "validation") ? toMessages((err as ServiceError).fields) : {};
        setError(msgs._form ?? msgs.confirmEmail ?? t.common.somethingWrong);
      },
    });

  return (
    <section className="px-5 pt-6">
      <Card className="border border-coral-100 p-4">
        <p className="flex items-center gap-2 font-bold text-coral-600">
          <Trash2 className="size-4" /> {t.settings.danger}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-600">{t.settings.deleteBody}</p>
        <Button variant="outline" block className="mt-3 border-coral-200 text-coral-600" onClick={() => setOpen(true)}>
          {t.settings.deleteButton}
        </Button>
      </Card>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t.settings.danger}
        footer={
          <Button block size="lg" variant="danger" loading={remove.isPending} disabled={!email} onClick={confirm}>
            {t.settings.deleteButton}
          </Button>
        }
      >
        <p className="mb-4 text-[14px] text-ink-600">{t.settings.deleteBody}</p>
        <Input label={t.settings.deleteConfirmLabel} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
      </BottomSheet>
    </section>
  );
}

export function SettingsScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <PageTitle title={t.settings.title} />
      <AuthGate>
        <PersonalSection />
        <ChildrenSection />
        <NotificationsSection />
        <DeliveriesSection />
        <PasswordSection />
        <ReportsSection />
        <LegalSection />
        <DeleteSection />
      </AuthGate>
    </Screen>
  );
}
