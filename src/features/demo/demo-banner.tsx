"use client";

import { motion } from "motion/react";
import { CircleCheck, FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import { appConfig } from "@/config/app-config";
import { Button } from "@/components/ui/button";
import { BottomSheet, ConfirmDialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/i18n-provider";
import { getServices } from "@/services";

export function useDemoReset() {
  const { t } = useI18n();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const reset = async () => {
    setLoading(true);
    try {
      await getServices().demo?.reset();
      toast.demo(t.demo.resetDone);
      // A full reload clears every cached screen and preserved route.
      window.setTimeout(() => window.location.reload(), 500);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };
  const dialog = (
    <ConfirmDialog
      open={confirming}
      onClose={() => setConfirming(false)}
      onConfirm={reset}
      loading={loading}
      title={t.demo.reset}
      body={t.demo.resetConfirm}
      confirmLabel={t.common.confirm}
      cancelLabel={t.common.cancel}
      icon={<RotateCcw className="size-6" />}
    />
  );
  return { open: () => setConfirming(true), dialog };
}

/** Always-visible strip that makes it clear the prototype shows simulated data. */
export function DemoBanner() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const resetter = useDemoReset();
  if (!appConfig.isPrototype) return null;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ y: -36 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative z-50 flex h-9 w-full items-center justify-center gap-2 overflow-hidden bg-ink-900 px-4 text-[12px] font-medium text-white"
      >
        <motion.span
          className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/15 to-transparent"
          initial={{ left: "-30%" }}
          animate={{ left: "130%" }}
          transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
          aria-hidden
        />
        <FlaskConical className="size-3.5 text-accent-400" aria-hidden />
        <span className="truncate">{t.demo.banner}</span>
        <span className="shrink-0 text-accent-300 underline decoration-dotted underline-offset-2">{t.demo.learnMore}</span>
      </motion.button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t.demo.sheetTitle}>
        <p className="text-[15px] leading-relaxed text-ink-600">{t.demo.sheetBody}</p>
        <ul className="mt-5 space-y-3">
          {t.demo.points.map((point, i) => (
            <motion.li
              key={point}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="flex items-start gap-3 rounded-2xl bg-ink-50 p-3 text-sm font-medium text-ink-800"
            >
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-mint-500" aria-hidden />
              {point}
            </motion.li>
          ))}
        </ul>
        <Button
          variant="outline"
          block
          className="mt-6"
          onClick={() => {
            setOpen(false);
            resetter.open();
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t.demo.reset}
        </Button>
      </BottomSheet>
      {resetter.dialog}
    </>
  );
}
