"use client";

import { motion } from "motion/react";
import {
  CalendarCheck,
  Compass,
  GraduationCap,
  Languages,
  LayoutDashboard,
  MessageCircle,
  RotateCcw,
  Smartphone,
  UserPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/illustrations/logo";
import { AppLink } from "@/components/layout/app-link";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { ForwardChevron } from "@/components/ui/primitives";
import { useDemoReset } from "./demo-banner";
import { LanguageSwitch, useSwitchLocale } from "./language-switch";
import { useRoleSwitch } from "./use-role-switch";

function Journey({
  icon,
  label,
  href,
  onClick,
  index,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  index: number;
}) {
  const content = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        {icon}
      </span>
      <span className="flex-1 text-start text-sm font-medium text-ink-800">{label}</span>
      <ForwardChevron className="size-4 text-ink-400 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
    </>
  );
  const className = "group flex w-full items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-ink-50";
  return (
    <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + index * 0.06 }}>
      {href ? (
        <AppLink href={href} className={className}>
          {content}
        </AppLink>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )}
    </motion.li>
  );
}

/**
 * Presenter panel shown beside the phone-sized app on large screens. It lists the key
 * journeys so the prototype is easy to demo to students and partners.
 */
export function DesktopGuide() {
  const { t, locale, l } = useI18n();
  const { session, role } = useSession();
  const roles = useRoleSwitch();
  const resetter = useDemoReset();
  const { change } = useSwitchLocale();

  return (
    <aside className="fixed inset-y-0 start-0 z-20 hidden w-[min(380px,calc((100vw-var(--app-max-width))/2))] flex-col justify-center p-8 xl:flex">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-[32px] bg-white/80 p-6 shadow-card ring-1 ring-white backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <LogoMark className="size-11" animated />
          <div>
            <p className="text-lg font-extrabold">{t.demo.guideTitle}</p>
            <p className="text-[13px] text-ink-500">{t.demo.guideSubtitle}</p>
          </div>
        </div>

        <ul className="mt-5 space-y-1">
          <Journey index={0} icon={<UserPlus className="size-4" />} label={t.demo.journeys.signup} href="/auth/sign-up" />
          <Journey index={1} icon={<Compass className="size-4" />} label={t.demo.journeys.search} href="/tutors" />
          <Journey index={2} icon={<CalendarCheck className="size-4" />} label={t.demo.journeys.book} href="/tutors/t-amine" />
          <Journey index={3} icon={<MessageCircle className="size-4" />} label={t.demo.journeys.chat} href="/messages" />
          <Journey
            index={4}
            icon={<LayoutDashboard className="size-4" />}
            label={t.demo.journeys.tutor}
            onClick={() => roles.switchTo("tutor")}
          />
          <Journey
            index={5}
            icon={<Languages className="size-4" />}
            label={t.demo.journeys.language}
            onClick={() => change(locale === "ar" ? "en" : "ar")}
          />
        </ul>

        <div className="mt-6 border-t border-ink-100 pt-5">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">{t.demo.personas}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["student", "tutor"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => roles.switchTo(r)}
                disabled={roles.pending !== null}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition-all",
                  role === r ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-700 hover:border-ink-300",
                )}
              >
                {r === "student" ? <GraduationCap className="size-4" /> : <LayoutDashboard className="size-4" />}
                {r === "student" ? t.demo.asStudent : t.demo.asTutor}
              </button>
            ))}
          </div>
          {session && <p className="mt-2 truncate text-center text-xs text-ink-500">{l(session.user.displayName)} · {session.user.email}</p>}
          <LanguageSwitch className="mt-4" />
          <button
            type="button"
            onClick={resetter.open}
            className="mt-4 flex w-full items-center justify-center gap-2 text-[13px] font-medium text-ink-500 transition-colors hover:text-coral-600"
          >
            <RotateCcw className="size-3.5" />
            {t.demo.reset}
          </button>
        </div>
      </motion.div>
      <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-ink-500">
        <Smartphone className="size-4" /> {t.demo.shareHint}
      </p>
      {resetter.dialog}
    </aside>
  );
}
