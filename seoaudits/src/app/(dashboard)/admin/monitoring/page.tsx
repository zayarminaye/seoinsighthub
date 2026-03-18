import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAdminUser } from '@/lib/adminAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RetryJobForm from './RetryJobForm';

type OverviewResponse = {
  data: {
    activeAudits: number;
    failedAudits24h: number;
    completedAudits24h: number;
    usersCount: number;
  };
  error?: string;
};

type QueuesResponse = {
  data: Record<
    string,
    { active: number; waiting: number; delayed: number; failed: number; completed: number }
  >;
  error?: string;
};

type AuditsResponse = {
  data: {
    active: Array<{ id: string; targetDomain: string; status: string; currentStepName: string | null }>;
    failed: Array<{ id: string; targetDomain: string; createdAt: string }>;
  };
  error?: string;
};

type AICitationsResponse = {
  data: {
    auditsWithStep16: number;
    attemptedQueries: number;
    successfulQueries: number;
    successRate: number;
    quotaHitAudits: number;
    quotaHitRate: number;
    avgRuntimeSeconds: number;
  };
  error?: string;
};

function buildBaseUrl(host: string | null, proto: string | null): string {
  const h = host ?? 'localhost:3000';
  const p = proto ?? (h.includes('localhost') ? 'http' : 'https');
  return `${p}://${h}`;
}

async function fetchAdminJson<T>(
  baseUrl: string,
  cookie: string,
  path: string
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
    if (!res.ok) {
      return { data: null, error: body.error ?? 'Failed to load data.' };
    }
    return { data: body.data ?? null, error: null };
  } catch {
    return { data: null, error: 'Failed to load data.' };
  }
}

export default async function AdminMonitoringPage() {
  if (!(await isAdminUser())) {
    redirect('/dashboard');
  }

  const h = await headers();
  const baseUrl = buildBaseUrl(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'));
  const cookie = h.get('cookie') ?? '';

  const [overviewRes, queuesRes, auditsRes, aiCitationsRes] = await Promise.all([
    fetchAdminJson<OverviewResponse['data']>(baseUrl, cookie, '/api/admin/monitoring/overview'),
    fetchAdminJson<QueuesResponse['data']>(baseUrl, cookie, '/api/admin/monitoring/queues'),
    fetchAdminJson<AuditsResponse['data']>(baseUrl, cookie, '/api/admin/monitoring/audits'),
    fetchAdminJson<AICitationsResponse['data']>(baseUrl, cookie, '/api/admin/monitoring/ai-citations'),
  ]);

  const overview = overviewRes.data ?? {
    activeAudits: 0,
    failedAudits24h: 0,
    completedAudits24h: 0,
    usersCount: 0,
  };
  const queues = queuesRes.data ?? {};
  const audits = auditsRes.data ?? { active: [], failed: [] };
  const aiCitations = aiCitationsRes.data ?? {
    auditsWithStep16: 0,
    attemptedQueries: 0,
    successfulQueries: 0,
    successRate: 0,
    quotaHitAudits: 0,
    quotaHitRate: 0,
    avgRuntimeSeconds: 0,
  };
  const apiErrors = [overviewRes.error, queuesRes.error, auditsRes.error, aiCitationsRes.error].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin: Monitoring</h1>
        <p className="text-sm text-muted-foreground">Queue health and audit pipeline status.</p>
        {apiErrors.length > 0 && (
          <p className="mt-2 text-sm text-amber-700">
            Some monitoring data could not be loaded: {apiErrors.join(' | ')}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Active Audits</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{overview.activeAudits}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Failed (24h)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{overview.failedAudits24h}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Completed (24h)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{overview.completedAudits24h}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Users</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{overview.usersCount}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="queues">
        <TabsList>
          <TabsTrigger value="queues">Queue Health</TabsTrigger>
          <TabsTrigger value="audits">Audit Status</TabsTrigger>
          <TabsTrigger value="ai-citations">AI Citations</TabsTrigger>
        </TabsList>

        <TabsContent value="queues" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Retry Failed Job</CardTitle></CardHeader>
            <CardContent>
              <RetryJobForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Queue Health</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(queues).map(([name, counts]) => (
                <div key={name} className="flex items-center justify-between rounded border px-3 py-2">
                  <div className="font-medium">{name}</div>
                  <div className="text-muted-foreground">
                    active {counts.active} | waiting {counts.waiting} | delayed {counts.delayed} | failed {counts.failed} | completed {counts.completed}
                  </div>
                </div>
              ))}
              {Object.keys(queues).length === 0 && (
                <div className="text-muted-foreground">No queue metrics available.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audits" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Active Audits ({audits.active.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {audits.active.map((a) => (
                  <div key={a.id} className="rounded border px-3 py-2">
                    <div className="font-medium">{a.targetDomain}</div>
                    <div className="text-muted-foreground">{a.status} | {a.currentStepName || 'Starting'}</div>
                  </div>
                ))}
                {audits.active.length === 0 && <div className="text-muted-foreground">No active audits.</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Failed Audits 24h ({audits.failed.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {audits.failed.map((a) => (
                  <div key={a.id} className="rounded border px-3 py-2">
                    <div className="font-medium">{a.targetDomain}</div>
                    <div className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {audits.failed.length === 0 && <div className="text-muted-foreground">No failures in last 24h.</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai-citations" className="mt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Step 16 Audits (24h)</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{aiCitations.auditsWithStep16}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Query Success Rate</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{aiCitations.successRate}%</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Quota Hit Rate</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{aiCitations.quotaHitRate}%</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Avg Runtime (s)</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{aiCitations.avgRuntimeSeconds}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Step 16 Throughput</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span className="font-medium">Attempted Queries</span>
                <span className="text-muted-foreground">{aiCitations.attemptedQueries}</span>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span className="font-medium">Successful Queries</span>
                <span className="text-muted-foreground">{aiCitations.successfulQueries}</span>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span className="font-medium">Audits with Quota Hits</span>
                <span className="text-muted-foreground">{aiCitations.quotaHitAudits}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
