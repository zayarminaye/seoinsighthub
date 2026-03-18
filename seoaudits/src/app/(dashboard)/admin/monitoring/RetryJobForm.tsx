'use client';

import { useState } from 'react';
import { QUEUE_NAMES } from '@/services/queue/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const queueValues = Object.values(QUEUE_NAMES);

export default function RetryJobForm() {
  const [jobId, setJobId] = useState('');
  const [queue, setQueue] = useState<string>(queueValues[0] ?? 'audit-orchestrator');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = jobId.trim();
    if (!id) {
      setStatus({ ok: false, message: 'Enter a job ID.' });
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/monitoring/retry/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ ok: false, message: body.error ?? 'Retry failed.' });
        return;
      }
      setStatus({ ok: true, message: 'Job retry requested successfully.' });
      setJobId('');
    } catch {
      setStatus({ ok: false, message: 'Network error while retrying job.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-4">
      <Input
        placeholder="BullMQ Job ID"
        value={jobId}
        onChange={(e) => setJobId(e.target.value)}
      />
      <select
        value={queue}
        onChange={(e) => setQueue(e.target.value)}
        className="h-9 w-full rounded-md border px-2 text-sm"
      >
        {queueValues.map((q) => (
          <option key={q} value={q}>
            {q}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={loading}>
        {loading ? 'Retrying...' : 'Retry Job'}
      </Button>
      <div className={`text-sm ${status?.ok ? 'text-green-700' : 'text-red-700'}`}>
        {status?.message ?? ''}
      </div>
    </form>
  );
}
