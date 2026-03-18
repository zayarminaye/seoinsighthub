'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function UserGeminiKeyManager({
  initialConfigured,
}: {
  initialConfigured: boolean;
}) {
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(initialConfigured);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  async function save(nextApiKey: string | null) {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/settings/gemini-key', {
        method: 'PUT',
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
      if (!res.ok) throw new Error(body.error ?? `Failed to save API key (HTTP ${res.status}).`);

      setConfigured(Boolean(body.data?.configured));
      setApiKey('');
      setStatus({
        type: 'success',
        message: body.data?.configured ? 'Your Gemini API key is saved.' : 'Your Gemini API key is cleared.',
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gemini API Key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your key is used first for AI citation analysis. If missing, the system may use admin fallback key.
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
      </CardContent>
    </Card>
  );
}
