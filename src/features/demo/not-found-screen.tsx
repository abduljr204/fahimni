"use client";

import { Compass } from "lucide-react";
import { AppLink } from "@/components/layout/app-link";
import { Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useI18n } from "@/i18n/i18n-provider";

export function NotFoundScreen() {
  const { t } = useI18n();
  return (
    <Screen className="grid place-items-center">
      <EmptyState
        icon={<Compass />}
        title={t.errors.notFoundTitle}
        body={t.errors.notFoundBody}
        action={
          <AppLink href="/">
            <Button>{t.errors.goHome}</Button>
          </AppLink>
        }
      />
    </Screen>
  );
}
