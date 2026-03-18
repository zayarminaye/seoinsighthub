'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const STEPS = [
  { num: 1, name: 'Crawlability & Indexability', pillar: 'Usability' },
  { num: 2, name: 'Crawl Depth Analysis', pillar: 'Usability' },
  { num: 3, name: 'Page Speed & Core Web Vitals', pillar: 'Usability' },
  { num: 4, name: 'INP Deep Dive', pillar: 'Usability' },
  { num: 5, name: 'Mobile-Friendliness', pillar: 'Usability' },
  { num: 6, name: 'HTTPS & Security', pillar: 'Usability' },
  { num: 7, name: 'Accessibility', pillar: 'Usability' },
  { num: 8, name: 'Title Tag & Meta Description', pillar: 'Relevance' },
  { num: 9, name: 'Heading Structure & Semantic HTML', pillar: 'Relevance' },
  { num: 10, name: 'NLP Keyword & Entity Optimization', pillar: 'Relevance' },
  { num: 11, name: 'Internal Linking', pillar: 'Relevance' },
  { num: 12, name: 'Content Freshness & Decay Detection', pillar: 'Relevance' },
  { num: 13, name: 'Structured Data & Schema Markup', pillar: 'Relevance' },
  { num: 14, name: 'Image Optimization', pillar: 'Relevance' },
  { num: 15, name: 'Backlink Profile Analysis', pillar: 'Authority' },
  { num: 16, name: 'AI Citation Gap Analysis', pillar: 'Authority' },
  { num: 17, name: 'E-E-A-T Signal Detection', pillar: 'Authority' },
  { num: 18, name: 'Brand Mention Tracking', pillar: 'Authority' },
] as const;

const PILLAR_META = {
  Usability: {
    description: 'Technical quality, crawl health, and user experience fundamentals.',
    tone: 'border-sky-200/70 bg-sky-50/50',
    badgeTone: 'bg-sky-100 text-sky-700',
  },
  Relevance: {
    description: 'On-page semantics, topical depth, and content discoverability.',
    tone: 'border-emerald-200/70 bg-emerald-50/50',
    badgeTone: 'bg-emerald-100 text-emerald-700',
  },
  Authority: {
    description: 'Trust signals, entity presence, and market visibility indicators.',
    tone: 'border-amber-200/70 bg-amber-50/50',
    badgeTone: 'bg-amber-100 text-amber-700',
  },
} as const;

type StepPillar = keyof typeof PILLAR_META;

export default function NewAuditPage() {
  const router = useRouter();
  const [domain, setDomain] = useState('');
  const [seedKeywordsText, setSeedKeywordsText] = useState('');
  const [competitorDomainsText, setCompetitorDomainsText] = useState('');
  const [maxPages, setMaxPages] = useState(50);
  const [selectedSteps, setSelectedSteps] = useState<number[]>([]);
  const [allowedSteps, setAllowedSteps] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stepConfigError, setStepConfigError] = useState<string | null>(null);
  const [activePillar, setActivePillar] = useState<StepPillar>('Usability');

  function normalizeUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function toggleStep(num: number) {
    setSelectedSteps((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort()
    );
  }

  const visibleSteps = useMemo(() => {
    if (!allowedSteps) return [];
    const allowSet = new Set(allowedSteps);
    return STEPS.filter((s) => allowSet.has(s.num));
  }, [allowedSteps]);

  function selectAll() {
    setSelectedSteps(visibleSteps.map((s) => s.num));
  }

  function deselectAll() {
    setSelectedSteps([]);
  }

  const groupedSteps = useMemo(
    () =>
      (Object.keys(PILLAR_META) as StepPillar[])
        .map((pillar) => ({
          pillar,
          ...PILLAR_META[pillar],
          steps: visibleSteps.filter((step) => step.pillar === pillar),
        }))
        .filter((group) => group.steps.length > 0),
    [visibleSteps]
  );

  const activeGroup = groupedSteps.find((group) => group.pillar === activePillar) ?? groupedSteps[0];
  const tabGridClass =
    groupedSteps.length <= 1
      ? 'grid-cols-1'
      : groupedSteps.length === 2
        ? 'grid-cols-2'
        : 'grid-cols-3';

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const res = await fetch('/api/audits/options', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Failed to load audit step configuration.');
        }

        const body = (await res.json()) as { data?: { allowedSteps?: number[] } };
        const nextAllowed =
          body.data?.allowedSteps?.filter((n): n is number => Number.isInteger(n)) ?? [];

        if (cancelled) return;

        setAllowedSteps(nextAllowed);
        setStepConfigError(null);
        setSelectedSteps((prev) => {
          const filtered = prev.filter((step) => nextAllowed.includes(step));
          return filtered.length > 0 ? filtered : nextAllowed;
        });
      } catch {
        if (cancelled) return;

        const fallback = STEPS.map((s) => s.num);
        setAllowedSteps(fallback);
        setStepConfigError('Could not verify feature configuration. Showing default step list.');
        setSelectedSteps((prev) => (prev.length > 0 ? prev : fallback));
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeGroup && groupedSteps[0]) {
      setActivePillar(groupedSteps[0].pillar);
    }
  }, [activeGroup, groupedSteps]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) {
      setDomainError('Please enter a domain.');
      setFormError(null);
      return;
    }
    if (allowedSteps === null) {
      setFormError('Loading available steps. Please try again in a moment.');
      setDomainError(null);
      return;
    }

    const allowedSet = new Set(allowedSteps);
    const selectedAllowedSteps = selectedSteps.filter((step) => allowedSet.has(step));

    if (selectedAllowedSteps.length === 0) {
      setFormError('Select at least one audit step.');
      setDomainError(null);
      return;
    }

    setLoading(true);
    setDomainError(null);
    setFormError(null);

    const seedKeywords = seedKeywordsText
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
    const competitorDomains = competitorDomainsText
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => normalizeUrl(v));

    try {
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: normalizeUrl(domain),
          seedKeywords,
          competitorDomains,
          maxPages,
          selectedSteps: selectedAllowedSteps,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const message = (data.error as string | undefined) ?? 'Failed to create audit.';
        if (
          /domain|url|reachable|public website|valid url/i.test(message)
        ) {
          setDomainError(message);
          setFormError(null);
        } else {
          setFormError(message);
          setDomainError(null);
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      router.push(`/audits/${data.auditId}`);
    } catch {
      setFormError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">New Audit</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Domain */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Target Website</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
              {domainError && (
                <p className="text-sm text-destructive" role="alert">
                  {domainError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Enter the domain without https:// — we&apos;ll add it automatically.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPages">Max Pages to Crawl</Label>
              <Input
                id="maxPages"
                type="number"
                min={1}
                max={500}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Free plan: up to 25 pages per audit.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="seedKeywords">
                Seed Keywords
                <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="seedKeywords"
                rows={3}
                value={seedKeywordsText}
                onChange={(e) => setSeedKeywordsText(e.target.value)}
                placeholder="e.g. technical seo audit, website performance"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use comma or new line separated values.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="competitorDomains">
                Competitor Domains
                <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="competitorDomains"
                rows={3}
                value={competitorDomainsText}
                onChange={(e) => setCompetitorDomainsText(e.target.value)}
                placeholder="e.g. competitor.com, https://another-example.com"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter one or more competitor domains (URL format accepted).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step Selection */}
        <Card>
          <CardHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">Audit Steps</CardTitle>
                <div className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {selectedSteps.length} / {visibleSteps.length} selected
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose the analysis scope by pillar. Selection changes are applied instantly.
              </p>
              {stepConfigError && (
                <p className="text-xs text-amber-700">{stepConfigError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={selectAll}
                  variant="outline"
                  size="sm"
                  disabled={loading || visibleSteps.length === 0}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  onClick={deselectAll}
                  variant="ghost"
                  size="sm"
                  disabled={loading || visibleSteps.length === 0}
                >
                  Deselect All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {allowedSteps === null && (
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                Loading available steps...
              </div>
            )}
            {allowedSteps !== null && groupedSteps.length === 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                No audit steps are currently enabled for your plan.
              </div>
            )}
            {groupedSteps.length > 0 && activeGroup && (
              <>
                <div className="rounded-xl border bg-muted/70 p-1.5">
                  <div className={`grid ${tabGridClass} gap-1`}>
                    {groupedSteps.map((group) => {
                      const isActive = activePillar === group.pillar;
                      return (
                        <button
                          key={group.pillar}
                          type="button"
                          onClick={() => setActivePillar(group.pillar)}
                          className={`flex min-h-[58px] flex-col items-center justify-center rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:text-sm ${
                            isActive
                              ? 'bg-background text-foreground shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground'
                          }`}
                        >
                          <span>{group.pillar}</span>
                          <span className="text-[11px] opacity-80">
                            {group.steps.filter((step) => selectedSteps.includes(step.num)).length}/{group.steps.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <section className={`rounded-xl border p-4 ${activeGroup.tone}`}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold tracking-wide text-foreground">
                        {activeGroup.pillar}
                      </h3>
                      <p className="text-xs text-muted-foreground">{activeGroup.description}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${activeGroup.badgeTone}`}>
                      {activeGroup.steps.filter((step) => selectedSteps.includes(step.num)).length} selected
                    </span>
                  </div>

                  <div className="grid gap-2">
                    {activeGroup.steps.map((step) => {
                      const isSelected = selectedSteps.includes(step.num);
                      return (
                        <label
                          key={step.num}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-background/90 p-3 transition-all hover:border-primary/40 hover:bg-background ${
                            isSelected ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleStep(step.num)}
                            className="h-4 w-4 rounded border-muted-foreground/40 accent-primary"
                          />
                          <span className="inline-flex min-w-14 items-center justify-center rounded-md border bg-muted/50 px-2 py-1 text-xs font-semibold text-muted-foreground">
                            Step {step.num}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{step.name}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating Audit...' : 'Start Audit'}
        </Button>
        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}
      </form>
    </div>
  );
}
