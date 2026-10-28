"use client";

import { Award, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Chip } from "@/components/ui/primitives";
import type { GradeLevel, LessonMode, SpokenLanguage, SubjectCategory, TutorProfile } from "@/domain/types";
import type { TutorProfileInput } from "@/domain/validation";
import { useSubjects } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";

export type ProfileDraft = TutorProfileInput;

export const LANGUAGES: SpokenLanguage[] = ["ar", "libyan", "en", "fr", "amazigh"];
export const LEVELS: GradeLevel[] = ["secondary", "university_early", "university_advanced", "postgraduate"];

export const emptyProfile: ProfileDraft = {
  headline: "",
  bio: "",
  university: "",
  city: "",
  languages: ["ar"],
  modes: ["online"],
  gradeLevels: ["university_early"],
  subjectIds: [],
  qualifications: [],
};

/** Tutors enter text in one language; the stored LocalizedText has it in both slots. */
export function draftFromTutor(tutor: TutorProfile, pick: (t: Partial<Record<"ar" | "en", string>>) => string): ProfileDraft {
  return {
    headline: pick(tutor.headline),
    bio: pick(tutor.bio),
    university: pick(tutor.university),
    city: pick(tutor.city),
    languages: tutor.languages,
    modes: tutor.modes,
    gradeLevels: tutor.gradeLevels,
    subjectIds: tutor.subjectIds,
    qualifications: tutor.qualifications.map(pick),
  };
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

function ErrorText({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-[13px] font-medium text-coral-600">{message}</p> : null;
}

/** Headline, bio, university, city, languages, formats and levels. */
export function ProfileFields({ draft, onChange, errors }: { draft: ProfileDraft; onChange: (patch: Partial<ProfileDraft>) => void; errors: Record<string, string> }) {
  const { t } = useI18n();
  const chip = "h-9 shadow-none ring-1 ring-ink-200";
  return (
    <div className="space-y-5">
      <Input label={t.onboarding.headline} placeholder={t.onboarding.headlinePlaceholder} value={draft.headline} maxLength={80} onChange={(e) => onChange({ headline: e.target.value })} error={errors.headline} />
      <Textarea label={t.onboarding.bio} placeholder={t.onboarding.bioPlaceholder} value={draft.bio} maxLength={1000} onChange={(e) => onChange({ bio: e.target.value })} error={errors.bio} />
      <div className="grid grid-cols-2 gap-3">
        <Input label={t.onboarding.university} value={draft.university} maxLength={80} onChange={(e) => onChange({ university: e.target.value })} error={errors.university} />
        <Input label={t.onboarding.city} value={draft.city} maxLength={40} onChange={(e) => onChange({ city: e.target.value })} error={errors.city} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">{t.onboarding.languages}</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <Chip key={lang} selected={draft.languages.includes(lang)} onClick={() => onChange({ languages: toggle(draft.languages, lang) })} className={chip}>
              {t.languagesSpoken[lang]}
            </Chip>
          ))}
        </div>
        <ErrorText message={errors.languages} />
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">{t.onboarding.modes}</legend>
        <div className="flex flex-wrap gap-2">
          {(["online", "in_person"] as LessonMode[]).map((m) => (
            <Chip key={m} selected={draft.modes.includes(m)} onClick={() => onChange({ modes: toggle(draft.modes, m) })} className={chip}>
              {m === "online" ? t.common.online : t.common.inPerson}
            </Chip>
          ))}
        </div>
        <ErrorText message={errors.modes} />
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">{t.onboarding.levels}</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((g) => (
            <Chip key={g} selected={draft.gradeLevels.includes(g)} onClick={() => onChange({ gradeLevels: toggle(draft.gradeLevels, g) })} className={chip}>
              {t.tutor.gradeLevelNames[g]}
            </Chip>
          ))}
        </div>
        <ErrorText message={errors.gradeLevels} />
      </fieldset>
    </div>
  );
}

/** Courses taught and qualifications. */
export function TeachingFields({ draft, onChange, errors }: { draft: ProfileDraft; onChange: (patch: Partial<ProfileDraft>) => void; errors: Record<string, string> }) {
  const { t, l } = useI18n();
  const { data: subjects = [] } = useSubjects();
  const [category, setCategory] = useState<SubjectCategory>("math");
  const [qualification, setQualification] = useState("");
  const categories = [...new Set(subjects.map((s) => s.category))];
  const chip = "h-9 shadow-none ring-1 ring-ink-200";

  const addQualification = () => {
    const q = qualification.trim();
    if (q.length < 3 || draft.qualifications.length >= 6) return;
    onChange({ qualifications: [...draft.qualifications, q] });
    setQualification("");
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">{t.onboarding.subjects}</legend>
        <div className="no-scrollbar -mx-1 mb-2 flex gap-2 overflow-x-auto px-1">
          {categories.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => setCategory(c)} layoutGroup="onboarding-category" className="h-8 text-[13px]">
              {t.categories[c]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {subjects
            .filter((s) => s.category === category || draft.subjectIds.includes(s.id))
            .map((s) => (
              <Chip key={s.id} selected={draft.subjectIds.includes(s.id)} onClick={() => onChange({ subjectIds: toggle(draft.subjectIds, s.id) })} className={chip}>
                {l(s.name)}
              </Chip>
            ))}
        </div>
        <ErrorText message={errors.subjectIds} />
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">{t.onboarding.qualifications}</legend>
        <ul className="mb-2 space-y-2">
          {draft.qualifications.map((q, i) => (
            <li key={`${q}-${i}`} className="flex items-center gap-2 rounded-2xl bg-ink-50 px-3 py-2 text-[14px]">
              <Award className="size-4 shrink-0 text-brand-600" />
              <span className="flex-1">{q}</span>
              <button type="button" onClick={() => onChange({ qualifications: draft.qualifications.filter((_, j) => j !== i) })} aria-label={t.onboarding.remove}>
                <X className="size-4 text-ink-400" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              placeholder={t.onboarding.qualificationPlaceholder}
              value={qualification}
              maxLength={120}
              aria-label={t.onboarding.qualifications}
              onChange={(e) => setQualification(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addQualification();
                }
              }}
            />
          </div>
          <Button variant="secondary" className="h-12" onClick={addQualification}>
            <Plus className="size-4" /> {t.onboarding.add}
          </Button>
        </div>
        <ErrorText message={errors.qualifications} />
      </fieldset>
    </div>
  );
}
