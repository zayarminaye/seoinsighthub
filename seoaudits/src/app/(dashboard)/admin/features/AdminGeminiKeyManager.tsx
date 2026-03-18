'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminGeminiKeyManager({
  initialConfigured,
  initialMaxQueries,
}: {
  initialConfigured: boolean;
  initialMaxQueries: number;
}) {
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(initialConfigured);
  const [maxQueries, setMaxQueries] = useState(String(initialMaxQueries));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetStatus, setBudgetStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  async function save(nextApiKey: string | null) {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/settings/gemini-key', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: nextApiKey }),
      });
      const raw = await res.text();
      let body: { data?: { configured: boolean }; error?: string } = {};
      try {
        body = JSON.parse(raw) as { data?: { configured: boolean }; error?: string };
      } catch {
        // Non-JSON response (e.g., HTML error page)
      }
      if (!res.ok) {
        throw new Error(body.error ?? `Failed to save API key (HTTP ${res.status}).`);
      }

      setConfigured(Boolean(body.data?.configured));
      setApiKey('');
      setStatus({
        type: 'success',
        message: body.data?.configured ? 'Admin Gemini API key saved.' : 'Admin Gemini API key cleared.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save API key.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveBudget() {
    setBudgetSaving(true);
    setBudgetStatus(null);
    try {
      const parsed = Number(maxQueries);
      const res = await fetch('/api/admin/settings/ai-budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxQueries: parsed }),
      });
      const raw = await res.text();
      let body: { data?: { maxQueries: number }; error?: string } = {};
      try {
        body = JSON.parse(raw) as { data?: { maxQueries: number }; error?: string };
      } catch {}

      if (!res.ok) {
        throw new Error(body.error ?? `Failed to save budget (HTTP ${res.status}).`);
      }
      const savedValue = body.data?.maxQueries ?? parsed;
      setMaxQueries(String(savedValue));
      setBudgetStatus({
        type: 'success',
        message: `Budget saved: ${savedValue} model queries per audit.`,
      });
    } catch (err) {
      setBudgetStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save budget.',
      });
    } finally {
      setBudgetSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gemini Settings (Admin)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Used only when a user has not configured their own key. Stored encrypted server-side.
        </p>
        <p className="text-sm">
          Current status:{' '}
          <span className={configured ? 'text-green-700' : 'text-muted-foreground'}>
            {configured ? 'Configured' : 'Not configured'}
          </span>
        </p>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter Gemini API key"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => save(apiKey)}
            disabled={saving || apiKey.trim().length === 0}
          >
            {saving ? 'Saving...' : 'Save key'}
          </Button>
          <Button type="button" variant="outline" onClick={() => save(null)} disabled={saving}>
            Clear key
          </Button>
        </div>
        {status && (
          <p className={`text-xs ${status.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {status.message}
          </p>
        )}

        <div className="border-t pt-3">
          <p className="mb-2 text-sm text-muted-foreground">
            Limit model usage to control quota costs and rate-limit failures.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={maxQueries}
              onChange={(e) => setMaxQueries(e.target.value)}
              className="w-40"
            />
            <Button type="button" onClick={saveBudget} disabled={budgetSaving}>
              {budgetSaving ? 'Saving...' : 'Save budget'}
            </Button>
          </div>
          {budgetStatus && (
            <p className={`mt-2 text-xs ${budgetStatus.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {budgetStatus.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
