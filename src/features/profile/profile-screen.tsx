"use client";

import { motion } from "motion/react";
import { Bell, FlaskConical, Heart, Info, Languages, LayoutDashboard, GraduationCap, LogOut, Presentation, RotateCcw, Settings, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AppLink } from "@/components/layout/app-link";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/data-viz";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Badge, Card, ForwardChevron, SectionHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app-config";
import { useDemoReset } from "@/features/demo/demo-banner";
import { LanguageSwitch } from "@/features/demo/language-switch";
import { useRoleSwitch } from "@/features/demo/use-role-switch";
import { TutorTile } from "@/features/tutors/shared";
import { useFavorites, useNotifications, useStudentBookings, useTutorSearch } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { stagger, fadeUp } from "@/lib/motion";

function Row({ icon, label, children, href, onClick, danger }: { icon: ReactNode; label: string; children?: ReactNode; href?: string; onClick?: () => void; danger?: boolean }) {
  const inner = (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${danger ? "bg-coral-100 text-coral-600" : "bg-brand-50 text-brand-600"}`}>{icon}</span>
      <span className={`flex-1 text-start text-[15px] font-medium ${danger ? "text-coral-600" : ""}`}>{label}</span>
      {children ?? <ForwardChevron className="size-4 text-ink-400" />}
    </>
  );
  const className = "flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50";
  if (href) return <AppLink href={href} className={className}>{inner}</AppLink>;
  if (onClick) return <button type="button" onClick={onClick} className={className}>{inner}</button>;
  return <div className={className}>{inner}</div>;
}

function Favorites() {
  const { t } = useI18n();
  const { data: ids = [] } = useFavorites();
  const { data: tutors = [] } = useTutorSearch({});
  const list = tutors.filter((x) => ids.includes(x.id));
  return (
    <section className="pt-6">
      <SectionHeader className="px-5" title={t.profile.favorites} />
      {list.length === 0 ? (
        <Card className="mx-5 flex items-center gap-3 p-4 text-sm text-ink-500">
          <Heart className="size-5 text-coral-400" /> {t.profile.noFavorites}
        </Card>
      ) : (
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-3">
          {list.map((tutor, i) => (
            <motion.div key={tutor.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
              <TutorTile tutor={tutor} />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProfileScreen() {
  const { t, l, fmt, href } = useI18n();
  const { session, status, role, signOut } = useSession();
  const roles = useRoleSwitch();
  const resetter = useDemoReset();
  const toast = useToast();
  const router = useRouter();
  const { data: bookings = [] } = useStudentBookings();
  const { data: favorites = [] } = useFavorites();
  const { data: notifications = [] } = useNotifications();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const unread = notifications.filter((n) => !n.readAt).length;

  const doSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirmSignOut(false);
    toast.info(t.auth.signedOut);
    router.push(href("/"));
  };

  return (
    <Screen>
      <PageTitle title={t.profile.title} />

      {status !== "loading" && !session && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="px-5">
          <Card className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
            <motion.span className="absolute -end-8 -top-8 size-32 rounded-full bg-white/10" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 6, repeat: Infinity }} />
            <p className="relative text-xl font-extrabold">{t.profile.guestTitle}</p>
            <p className="relative mt-1.5 text-sm text-white/75">{t.profile.guestBody}</p>
            <div className="relative mt-5 flex gap-3">
              <AppLink href="/auth/sign-up">
                <Button variant="accent">{t.booking.createAccount}</Button>
              </AppLink>
              <AppLink href="/auth/sign-in">
                <Button variant="ghost" className="text-white hover:bg-white/10">
                  {t.auth.signIn}
                </Button>
              </AppLink>
            </div>
          </Card>
        </motion.div>
      )}

      {session && (
        <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="px-5">
          <motion.div variants={fadeUp}>
            <Card className="p-5">
              <div className="flex items-center gap-4">
                <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
                  <Avatar name={l(session.user.displayName)} hue={session.user.avatarHue} size="lg" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold">{l(session.user.displayName)}</p>
                  <p className="truncate text-[13px] text-ink-500" dir="ltr">
                    {session.user.email}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{{ tutor: t.profile.tutor, admin: t.profile.admin, parent: t.profile.parent, student: t.profile.student }[role ?? "student"]}</Badge>
                    {session.isDemo && (
                      <Badge tone="accent">
                        <FlaskConical className="size-3" /> {t.demo.demoAccount}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {session.managedStudents?.map((child) => (
                <p key={child.userId} className="mt-4 flex items-center gap-2 rounded-2xl bg-ink-50 px-4 py-2.5 text-[13px] text-ink-600">
                  <Users className="size-4 shrink-0 text-brand-600" />
                  {fmt(t.profile.managing, { name: l(child.displayName) })}
                </p>
              ))}
              {session.student && (
                <p className="mt-4 rounded-2xl bg-ink-50 px-4 py-2.5 text-[13px] text-ink-600">
                  {l(session.student.major)} · {l(session.student.university)} · {fmt(t.profile.year, { n: session.student.studyYear })}
                </p>
              )}
              {role === "student" && (
                <div className="mt-4 grid grid-cols-3 text-center">
                  {[
                    { v: bookings.filter((b) => b.lessonStatus === "completed").length, label: t.profile.stats.lessons },
                    { v: favorites.length, label: t.profile.stats.tutors },
                    { v: bookings.filter((b) => b.reviewId).length, label: t.profile.stats.reviews },
                  ].map((s) => (
                    <div key={s.label}>
                      <AnimatedNumber value={s.v} className="text-xl font-extrabold" />
                      <p className="text-[12px] text-ink-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        </motion.div>
      )}

      {session && role === "student" && <Favorites />}

      <section className="px-5 pt-6">
        <SectionHeader title={t.profile.settings} />
        <Card className="divide-y divide-ink-100 overflow-hidden">
          <div className="px-4 py-3">
            <div className="mb-2.5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <Languages className="size-5" />
              </span>
              <span className="text-[15px] font-medium">{t.profile.language}</span>
            </div>
            <LanguageSwitch />
          </div>
          {session && (
            <Row icon={<Settings className="size-5" />} label={t.profile.accountSettings} href="/settings" />
          )}
          {role !== "tutor" && role !== "admin" && (
            <Row icon={<Presentation className="size-5" />} label={t.profile.becomeTutor} href="/become-tutor" />
          )}
          {session && (
            <Row icon={<Bell className="size-5" />} label={t.profile.notifications} href="/notifications">
              <span className="flex items-center gap-2">
                {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-coral-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
                <ForwardChevron className="size-4 text-ink-400" />
              </span>
            </Row>
          )}
          {roles.available && (
            <Row
              icon={role === "tutor" ? <GraduationCap className="size-5" /> : <LayoutDashboard className="size-5" />}
              label={role === "tutor" ? t.profile.switchToStudent : t.profile.switchToTutor}
              onClick={() => roles.switchTo(role === "tutor" ? "student" : "tutor")}
            />
          )}
          {roles.available && role !== "parent" && (
            <Row icon={<Users className="size-5" />} label={t.profile.switchToParent} onClick={() => roles.switchTo("parent")} />
          )}
          {roles.available && role !== "admin" && (
            <Row icon={<ShieldCheck className="size-5" />} label={t.profile.switchToAdmin} onClick={() => roles.switchTo("admin")} />
          )}
          {appConfig.isPrototype && <Row icon={<RotateCcw className="size-5" />} label={t.demo.reset} onClick={resetter.open} />}
          <Row icon={<Info className="size-5" />} label={t.profile.mode}>
            <Badge tone={appConfig.isPrototype ? "accent" : "mint"}>
              {appConfig.isPrototype ? t.profile.prototypeMode : t.profile.productionMode} · v0.1
            </Badge>
          </Row>
          {session && <Row icon={<LogOut className="size-5" />} label={t.profile.signOut} onClick={() => setConfirmSignOut(true)} danger />}
        </Card>
      </section>

      <ConfirmDialog
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={doSignOut}
        loading={signingOut}
        title={t.profile.signOut}
        confirmLabel={t.profile.signOut}
        cancelLabel={t.common.cancel}
        icon={<LogOut className="size-6" />}
      />
      {resetter.dialog}
    </Screen>
  );
}
