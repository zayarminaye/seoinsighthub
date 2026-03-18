'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

interface FeatureConfig {
  enabled: boolean;
  plans: PlanTier[];
  description: string;
}

interface FeatureEntry {
  name: string;
  cfg: FeatureConfig;
}

export default function FeaturesManager({
  initialEntries,
}: {
  initialEntries: FeatureEntry[];
}) {
  const [entries, setEntries] = useState<FeatureEntry[]>(initialEntries);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<
    Record<string, { type: 'success' | 'error'; message: string }>
  >({});
  const plans: PlanTier[] = ['free', 'starter', 'pro', 'enterprise'];

  async function onSave(
    event: React.FormEvent<HTMLFormElement>,
    featureName: string
  ) {
    event.preventDefault();
    setSavingName(featureName);
    setRowStatus((prev) => {
      const next = { ...prev };
      delete next[featureName];
      return next;
    });

    const formData = new FormData(event.currentTarget);
    const payload = {
      enabled: formData.get('enabled') === 'true',
      description: String(formData.get('description') ?? ''),
      plans: formData
        .getAll('plans')
        .filter((v): v is string => typeof v === 'string') as PlanTier[],
    };

    try {
      const res = await fetch(`/api/admin/features/${encodeURIComponent(featureName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let body: { data?: FeatureConfig; error?: string } = {};
      try {
        body = JSON.parse(raw) as { data?: FeatureConfig; error?: string };
      } catch {
        // Non-JSON response (e.g., HTML error page)
      }

      if (!res.ok) {
        const message = body.error ?? `Failed to update feature (HTTP ${res.status}).`;
        throw new Error(message);
      }

      const nextCfg = body.data ?? payload;
      setEntries((prev) =>
        prev.map((entry) =>
          entry.name === featureName ? { ...entry, cfg: nextCfg } : entry
        )
      );
      setRowStatus((prev) => ({
        ...prev,
        [featureName]: { type: 'success', message: 'Feature updated' },
      }));
    } catch (err) {
      setRowStatus((prev) => ({
        ...prev,
        [featureName]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to update feature',
        },
      }));
    } finally {
      setSavingName(null);
    }
  }

  return (
    <Tabs defaultValue="manage">
      <TabsList>
        <TabsTrigger value="manage">Manage Flags</TabsTrigger>
        <TabsTrigger value="matrix">Plan Matrix</TabsTrigger>
      </TabsList>

      <TabsContent value="manage" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Flags ({entries.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {entries.map(({ name, cfg }) => (
              <form
                key={name}
                onSubmit={(e) => onSave(e, name)}
                className="grid grid-cols-1 gap-3 rounded border p-3 md:grid-cols-6"
              >
                <div className="md:col-span-2">
                  <div className="font-medium text-sm">{name}</div>
                  <div className="text-xs text-muted-foreground">{cfg.description}</div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Enabled</label>
                  <select
                    name="enabled"
                    defaultValue={String(cfg.enabled)}
                    className="h-9 w-full rounded-md border px-2 text-sm"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Plan Access
                  </label>
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-2 text-sm">
                    {plans.map((plan) => (
                      <label key={`${name}-${plan}`} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="plans"
                          value={plan}
                          defaultChecked={cfg.plans.includes(plan)}
                          className="h-4 w-4 rounded border-muted-foreground/40 accent-primary"
                        />
                        <span className="capitalize">{plan}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-end justify-end">
                  <div className="text-right">
                    <Button type="submit" size="sm" disabled={savingName === name}>
                      {savingName === name ? 'Saving...' : 'Save'}
                    </Button>
                    {rowStatus[name] && (
                      <p
                        className={`mt-2 text-xs ${
                          rowStatus[name].type === 'success'
                            ? 'text-green-700'
                            : 'text-red-700'
                        }`}
                      >
                        {rowStatus[name].message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="md:col-span-6">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Description
                  </label>
                  <input
                    className="h-9 w-full rounded-md border px-2 text-sm"
                    name="description"
                    defaultValue={cfg.description}
                  />
                </div>
              </form>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="matrix" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Flag Availability by Plan</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left">Flag</th>
                  {plans.map((plan) => (
                    <th key={plan} className="px-3 py-2 text-left capitalize">
                      {plan}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(({ name, cfg }) => (
                  <tr key={name} className="border-b">
                    <td className="px-3 py-2 font-medium">{name}</td>
                    {plans.map((plan) => (
                      <td key={plan} className="px-3 py-2">
                        {cfg.enabled && cfg.plans.includes(plan) ? 'Enabled' : 'Disabled'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
