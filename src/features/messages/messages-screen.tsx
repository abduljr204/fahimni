"use client";

import { AnimatePresence, motion } from "motion/react";
import { MessagesSquare, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/layout/app-link";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/primitives";
import { AuthGate } from "@/features/auth/auth-gate";
import { useConversations } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";

function ConversationList() {
  const { t, l, chatTime } = useI18n();
  const { session, role } = useSession();
  const { data, isLoading } = useConversations();
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (data ?? []).filter((c) => c.lastMessagePreview || c.unreadCount);
    return q ? all.filter((c) => Object.values(c.counterpart.displayName).some((n) => n?.toLowerCase().includes(q))) : all;
  }, [data, query]);

  if (isLoading) {
    return (
      <div className="space-y-2 px-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="px-5 pb-3">
        <label className="flex h-11 items-center gap-2 rounded-2xl bg-white px-4 shadow-card focus-within:shadow-[0_0_0_4px_var(--color-brand-100)]">
          <Search className="size-4 text-ink-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.messages.searchPlaceholder}
            aria-label={t.messages.searchPlaceholder}
            className="h-full flex-1 bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title={t.messages.emptyTitle}
          body={t.messages.emptyBody}
          action={
            role !== "tutor" ? (
              <AppLink href="/tutors">
                <Button variant="secondary">{t.lessons.findTutor}</Button>
              </AppLink>
            ) : undefined
          }
        />
      ) : (
        <ul className="px-3">
          <AnimatePresence initial={false}>
            {list.map((c, i) => {
              const lastIsMine = c.lastMessageSenderId === session?.user.id;
              return (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.04 }}
                >
                  <AppLink
                    href={`/messages/${c.id}`}
                    className="flex items-center gap-3 rounded-3xl p-2.5 transition-colors hover:bg-white active:bg-white"
                  >
                    <Avatar name={l(c.counterpart.displayName)} hue={c.counterpart.avatarHue} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("truncate text-[15px]", c.unreadCount ? "font-extrabold" : "font-bold")}>
                          {l(c.counterpart.displayName)}
                        </p>
                        <span className={cn("shrink-0 text-[12px]", c.unreadCount ? "font-bold text-brand-600" : "text-ink-400")}>
                          {chatTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className={cn("truncate text-[13px]", c.unreadCount ? "font-semibold text-ink-800" : "text-ink-500")}>
                          {lastIsMine && t.messages.you}
                          {c.lastMessagePreview || l(c.counterpart.subtitle)}
                        </p>
                        <AnimatePresence>
                          {c.unreadCount > 0 && (
                            <motion.span
                              key={c.unreadCount}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 15 }}
                              className="relative grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white"
                            >
                              <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-brand-400" />
                              {c.unreadCount}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </AppLink>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}

export function MessagesScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <PageTitle title={t.messages.title} />
      <AuthGate title={t.messages.signInToChat}>
        <ConversationList />
      </AuthGate>
    </Screen>
  );
}
