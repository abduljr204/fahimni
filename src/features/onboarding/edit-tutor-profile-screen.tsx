"use client";

import { useState } from "react";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { TutorProfile } from "@/domain/types";
import { fieldErrors, tutorProfileSchema } from "@/domain/validation";
import { TutorOnly } from "@/features/dashboard/dashboard-screen";
import { useTutor, useUpdateTutorProfile } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { draftFromTutor, ProfileFields, TeachingFields, type ProfileDraft } from "./tutor-profile-fields";

function Form({ tutor }: { tutor: TutorProfile }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const save = useUpdateTutorProfile();
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromTutor(tutor, l));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const messages: Record<string, string> = t.validation;
  const change = (p: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...p }));

  const submit = () => {
    const parsed = tutorProfileSchema.safeParse(draft);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(Object.fromEntries(Object.entries(errs).map(([k, v]) => [k.split(".")[0], messages[v] ?? t.validation.required])));
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => toast.success(t.onboarding.profileSaved),
      onError: () => toast.error(t.common.somethingWrong),
    });
  };

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="p-4">
        <ProfileFields draft={draft} onChange={change} errors={errors} />
      </Card>
      <Card className="p-4">
        <TeachingFields draft={draft} onChange={change} errors={errors} />
      </Card>
      <Button block size="lg" loading={save.isPending} onClick={submit}>
        {t.settings.saveChanges}
      </Button>
    </div>
  );
}

export function EditTutorProfileScreen() {
  const { t } = useI18n();
  const { session } = useSession();
  const { data: tutor } = useTutor(session?.tutorId);
  return (
    <Screen>
      <PageTitle title={t.dashboard.editProfile} />
      <TutorOnly>{tutor ? <Form key={tutor.id} tutor={tutor} /> : <Skeleton className="mx-5 h-96 rounded-3xl" />}</TutorOnly>
    </Screen>
  );
}
