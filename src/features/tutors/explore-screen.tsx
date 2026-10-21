"use client";

import { AnimatePresence, motion } from "motion/react";
import { Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { use, useDeferredValue, useMemo, useState } from "react";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BottomSheet } from "@/components/ui/overlays";
import { Chip, Switch } from "@/components/ui/primitives";
import { brand } from "@/config/app-config";
import { toMajor, toMinor } from "@/domain/money";
import { SUBJECT_CATEGORIES, type LessonMode, type SubjectCategory } from "@/domain/types";
import { useSubjects, useTutorSearch } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import type { TutorSearchFilters, TutorSort } from "@/services";
import { categoryIcons, TutorCard, TutorCardSkeleton } from "./shared";

type Filters = Omit<TutorSearchFilters, "query">;

// Price filter bounds in major units (LYD per hour).
const MIN_PRICE = 20;
const MAX_PRICE = 80;
const SORTS: TutorSort[] = ["recommended", "rating", "priceAsc", "priceDesc"];

function activeFilterCount(f: Filters): number {
  return [f.subjectId, f.mode, f.maxHourlyRateMinor, f.minRating, f.instantOnly, f.verifiedOnly, f.sort && f.sort !== "recommended"].filter(Boolean).length;
}

function FilterSheet({
  open,
  onClose,
  filters,
  onApply,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onApply: (f: Filters) => void;
  resultCount?: number;
}) {
  const { t, l, money } = useI18n();
  const { data: subjects = [] } = useSubjects();
  // The parent remounts this sheet (via `key`) each time it opens, so the draft starts fresh.
  const [draft, setDraft] = useState<Filters>(filters);

  const { data: preview } = useTutorSearch(draft);
  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const visibleSubjects = draft.category ? subjects.filter((s) => s.category === draft.category) : subjects;
  const price = draft.maxHourlyRateMinor ? toMajor(draft.maxHourlyRateMinor, brand.currency) : MAX_PRICE;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t.search.filters}
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setDraft({ category: draft.category })}>
            {t.search.reset}
          </Button>
          <Button
            block
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {t.search.apply}
            <motion.span key={preview?.length} initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="rounded-lg bg-white/20 px-2 py-0.5 text-sm">
              {preview?.length ?? resultCount ?? 0}
            </motion.span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2.5 text-sm font-bold">{t.search.sort}</legend>
          <div className="flex flex-wrap gap-2">
            {SORTS.map((s) => (
              <Chip key={s} selected={(draft.sort ?? "recommended") === s} onClick={() => set({ sort: s })} className="h-9 shadow-none ring-1 ring-ink-200">
                {t.search.sortOptions[s]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-sm font-bold">{t.search.mode}</legend>
          <div className="flex gap-2">
            {([undefined, "online", "in_person"] as (LessonMode | undefined)[]).map((m) => (
              <Chip key={m ?? "any"} selected={draft.mode === m} onClick={() => set({ mode: m })} className="h-9 shadow-none ring-1 ring-ink-200">
                {m === "online" ? t.common.online : m === "in_person" ? t.common.inPerson : t.search.anyMode}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <div className="mb-2.5 flex items-center justify-between">
            <legend className="text-sm font-bold">{t.search.price}</legend>
            <motion.span key={price} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-sm font-bold text-brand-700">
              {money({ amountMinor: toMinor(price, brand.currency), currency: brand.currency }, { compact: true })}
            </motion.span>
          </div>
          <input
            type="range"
            min={MIN_PRICE}
            max={MAX_PRICE}
            step={5}
            value={price}
            onChange={(e) => {
              const v = Number(e.target.value);
              set({ maxHourlyRateMinor: v >= MAX_PRICE ? undefined : toMinor(v, brand.currency) });
            }}
            aria-label={t.search.price}
            className="w-full accent-brand-600"
          />
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-sm font-bold">{t.search.minRating}</legend>
          <div className="flex gap-2">
            {[undefined, 4.5, 4.8].map((r) => (
              <Chip key={r ?? "any"} selected={draft.minRating === r} onClick={() => set({ minRating: r })} className="h-9 shadow-none ring-1 ring-ink-200">
                {r ? `★ ${r}+` : t.search.anyRating}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-sm font-bold">{t.search.subject}</legend>
          <div className="flex flex-wrap gap-2">
            {visibleSubjects.map((s) => (
              <Chip
                key={s.id}
                selected={draft.subjectId === s.id}
                onClick={() => set({ subjectId: draft.subjectId === s.id ? undefined : s.id })}
                className="h-9 shadow-none ring-1 ring-ink-200"
              >
                {l(s.name)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="space-y-4 rounded-2xl bg-ink-50 p-4">
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            {t.search.instantOnly}
            <Switch checked={Boolean(draft.instantOnly)} onChange={(v) => set({ instantOnly: v || undefined })} label={t.search.instantOnly} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            {t.search.verifiedOnly}
            <Switch checked={Boolean(draft.verifiedOnly)} onChange={(v) => set({ verifiedOnly: v || undefined })} label={t.search.verifiedOnly} />
          </label>
        </div>
      </div>
    </BottomSheet>
  );
}

export function ExploreScreen({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = use(searchParams);
  const category = SUBJECT_CATEGORIES.includes(params.category as SubjectCategory) ? (params.category as SubjectCategory) : undefined;
  // New search params (e.g. tapping a category on the home screen) start a fresh search.
  return <Explore key={`${params.q ?? ""}|${category ?? ""}`} initialQuery={params.q ?? ""} initialCategory={category} />;
}

function Explore({ initialQuery, initialCategory }: { initialQuery: string; initialCategory?: SubjectCategory }) {
  const { t, plural } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<Filters>({ category: initialCategory });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);

  const deferredQuery = useDeferredValue(query);
  const request = useMemo(() => ({ ...filters, query: deferredQuery || undefined }), [filters, deferredQuery]);
  const { data, isLoading, isFetching } = useTutorSearch(request);
  const count = activeFilterCount(filters);

  return (
    <Screen>
      <PageTitle title={t.search.title} />

      <div className="sticky top-0 z-30 space-y-3 bg-canvas/85 px-5 pt-2 pb-3 backdrop-blur-xl">
        <div className="flex gap-2">
          <label className="relative flex h-12 flex-1 items-center rounded-2xl bg-white shadow-card transition-shadow focus-within:shadow-[0_0_0_4px_var(--color-brand-100)]">
            <Search className="ms-4 size-5 shrink-0 text-ink-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search.placeholder}
              aria-label={t.search.placeholder}
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-ink-400"
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  type="button"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  onClick={() => setQuery("")}
                  className="me-2 grid size-8 place-items-center rounded-full bg-ink-100 text-ink-500"
                  aria-label={t.search.reset}
                >
                  <X className="size-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </label>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              setSheetKey((k) => k + 1);
              setSheetOpen(true);
            }}
            className={cn(
              "relative grid size-12 place-items-center rounded-2xl shadow-card transition-colors",
              count ? "bg-brand-600 text-white" : "bg-white text-ink-700",
            )}
            aria-label={t.search.filters}
          >
            <SlidersHorizontal className="size-5" aria-hidden />
            <AnimatePresence>
              {count > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-canvas bg-accent-400 text-[10px] font-bold text-ink-950"
                >
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          <Chip layoutGroup="cat" selected={!filters.category} onClick={() => setFilters((f) => ({ ...f, category: undefined, subjectId: undefined }))}>
            {t.search.all}
          </Chip>
          {SUBJECT_CATEGORIES.map((c) => {
            const Icon = categoryIcons[c];
            return (
              <Chip
                key={c}
                layoutGroup="cat"
                selected={filters.category === c}
                onClick={() => setFilters((f) => ({ ...f, category: c, subjectId: undefined }))}
                icon={<Icon className="size-4" aria-hidden />}
              >
                {t.categories[c]}
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="px-5">
        <div className="mb-3 flex h-6 items-center justify-between text-sm">
          <AnimatePresence mode="wait">
            <motion.p
              key={data?.length ?? "loading"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="font-semibold text-ink-600"
            >
              {data ? plural(t.search.results, data.length) : t.common.loading}
            </motion.p>
          </AnimatePresence>
          {isFetching && !isLoading && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="size-2 animate-pulse rounded-full bg-brand-500" />
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <TutorCardSkeleton key={i} />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <motion.div className={cn("space-y-3 transition-opacity", isFetching && "opacity-70")}>
            <AnimatePresence mode="popLayout" initial={false}>
              {data.map((tutor, i) => (
                <TutorCard key={tutor.id} tutor={tutor} index={i} />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <EmptyState
            icon={<SearchX />}
            title={t.search.emptyTitle}
            body={t.search.emptyBody}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setFilters({});
                }}
              >
                {t.search.clearFilters}
              </Button>
            }
          />
        )}
      </div>

      <FilterSheet key={sheetKey} open={sheetOpen} onClose={() => setSheetOpen(false)} filters={filters} onApply={setFilters} resultCount={data?.length} />
    </Screen>
  );
}
