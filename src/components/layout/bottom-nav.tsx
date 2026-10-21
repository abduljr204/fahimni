"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, CalendarClock, Compass, House, LayoutDashboard, MessageCircle, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useConversations } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { AppLink } from "./app-link";
import { useAppPath } from "./use-app-path";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  badge?: number;
}

/** Routes that show the bottom navigation. Flows such as booking or chat hide it. */
export function shouldShowNav(path: string): boolean {
  if (path.startsWith("/book") || path.startsWith("/auth")) return false;
  if (/^\/messages\/.+/.test(path)) return false;
  if (/^\/tutors\/.+/.test(path)) return false;
  return true;
}

export function BottomNav() {
  const { t } = useI18n();
  const path = useAppPath();
  const { role } = useSession();
  const { data: conversations } = useConversations();
  const unread = conversations?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;

  const student: NavItem[] = [
    { href: "/", label: t.nav.home, icon: House, match: (p) => p === "/" },
    { href: "/tutors", label: t.nav.explore, icon: Compass, match: (p) => p.startsWith("/tutors") },
    { href: "/lessons", label: t.nav.lessons, icon: CalendarDays, match: (p) => p.startsWith("/lessons") },
    { href: "/messages", label: t.nav.messages, icon: MessageCircle, match: (p) => p.startsWith("/messages"), badge: unread },
    { href: "/profile", label: t.nav.profile, icon: UserRound, match: (p) => p.startsWith("/profile") || p.startsWith("/notifications") },
  ];
  const tutor: NavItem[] = [
    { href: "/tutor", label: t.nav.dashboard, icon: LayoutDashboard, match: (p) => p === "/tutor" },
    { href: "/lessons", label: t.nav.lessons, icon: CalendarDays, match: (p) => p.startsWith("/lessons") },
    { href: "/tutor/schedule", label: t.nav.schedule, icon: CalendarClock, match: (p) => p.startsWith("/tutor/schedule") },
    { href: "/messages", label: t.nav.messages, icon: MessageCircle, match: (p) => p.startsWith("/messages"), badge: unread },
    { href: "/profile", label: t.nav.profile, icon: UserRound, match: (p) => p.startsWith("/profile") || p.startsWith("/notifications") },
  ];
  const items = role === "tutor" ? tutor : student;
  const visible = shouldShowNav(path);

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          key={role ?? "guest"}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={spring.sheet}
          className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[var(--app-max-width)] px-3 pb-3"
          aria-label="Main"
        >
          <ul className="flex h-[var(--nav-height)] items-stretch rounded-[26px] border border-white/60 bg-white/90 px-1.5 shadow-nav backdrop-blur-xl">
            {items.map((item) => {
              const active = item.match(path);
              const Icon = item.icon;
              return (
                <li key={item.href} className="flex-1">
                  <AppLink
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="relative flex h-full flex-col items-center justify-center gap-0.5"
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-x-1 inset-y-2 rounded-2xl bg-brand-50"
                        transition={spring.snappy}
                      />
                    )}
                    <motion.span
                      className="relative"
                      animate={active ? { y: -1, scale: 1.08 } : { y: 0, scale: 1 }}
                      whileTap={{ scale: 0.85 }}
                      transition={spring.bouncy}
                    >
                      <Icon
                        className={cn("size-[22px] transition-colors duration-200", active ? "text-brand-600" : "text-ink-400")}
                        strokeWidth={active ? 2.4 : 2}
                        aria-hidden
                      />
                      <AnimatePresence>
                        {item.badge ? (
                          <motion.span
                            key={item.badge}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={spring.bouncy}
                            className="absolute -end-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-coral-500 px-1 text-[10px] font-bold text-white"
                          >
                            {item.badge}
                            <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-coral-400" />
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </motion.span>
                    <span
                      className={cn(
                        "relative text-[11px] transition-colors duration-200",
                        active ? "font-bold text-brand-700" : "font-medium text-ink-500",
                      )}
                    >
                      {item.label}
                    </span>
                  </AppLink>
                </li>
              );
            })}
          </ul>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
