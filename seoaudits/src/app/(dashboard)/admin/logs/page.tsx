import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAdminUser } from '@/lib/adminAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type LogRow = {
  id: string;
  action: string;
  createdAt: string;
  adminId: string;
  targetId: string | null;
  ipAddress: string | null;
  details: unknown;
};

function buildBaseUrl(host: string | null, proto: string | null): string {
  const h = host ?? 'localhost:3000';
  const p = proto ?? (h.includes('localhost') ? 'http' : 'https');
  return `${p}://${h}`;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    adminId?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  if (!(await isAdminUser())) {
    redirect('/dashboard');
  }

  const sp = await searchParams;
  const action = (sp.action ?? '').trim();
  const adminId = (sp.adminId ?? '').trim();
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const limit = Math.min(200, Math.max(10, Number(sp.limit ?? '50') || 50));

  const h = await headers();
  const baseUrl = buildBaseUrl(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'));
  const cookie = h.get('cookie') ?? '';
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(action ? { action } : {}),
    ...(adminId ? { adminId } : {}),
  });

  let logs: LogRow[] = [];
  let totalCount = 0;
  let tableMissing = false;
  let apiError: string | null = null;
  try {
    const res = await fetch(`${baseUrl}/api/admin/logs?${qs.toString()}`, {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: LogRow[];
      totalCount?: number;
      tableMissing?: boolean;
      error?: string;
    };
    if (!res.ok) {
      apiError = body.error ?? 'Failed to load logs.';
    } else {
      logs = body.data ?? [];
      totalCount = body.totalCount ?? 0;
      tableMissing = body.tableMissing === true;
    }
  } catch {
    apiError = 'Failed to load logs.';
  }

  const actionCounts = logs.reduce<Record<string, number>>((acc, log) => {
    acc[log.action] = (acc[log.action] ?? 0) + 1;
    return acc;
  }, {});
  const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const pageHref = (nextPage: number) => {
    const q = new URLSearchParams({
      page: String(nextPage),
      limit: String(limit),
      ...(action ? { action } : {}),
      ...(adminId ? { adminId } : {}),
    });
    return `/admin/logs?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin: Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Immutable record of admin actions.</p>
        {tableMissing && (
          <p className="mt-2 text-sm text-amber-700">
            Admin audit log table is missing. Apply migrations to enable log storage.
          </p>
        )}
        {apiError && <p className="mt-2 text-sm text-red-700">{apiError}</p>}
      </div>

      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Recent Entries</TabsTrigger>
          <TabsTrigger value="summary">Action Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <form className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <Input name="action" placeholder="Filter by action" defaultValue={action} />
                <Input name="adminId" placeholder="Filter by adminId" defaultValue={adminId} />
                <Input name="limit" type="number" min={10} max={200} defaultValue={String(limit)} />
                <Button type="submit" variant="outline">Apply</Button>
                <Button asChild type="button" variant="ghost">
                  <Link href="/admin/logs">Reset</Link>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Entries ({logs.length}) - page {page} of {totalPages}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {logs.map((log) => (
                <div key={log.id} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{log.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    admin: {log.adminId}
                    {log.targetId ? ` | target: ${log.targetId}` : ''}
                    {log.ipAddress ? ` | ip: ${log.ipAddress}` : ''}
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted-foreground">No admin actions recorded yet.</div>
              )}

              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <Button asChild variant="outline" size="sm" disabled={!hasPrev}>
                  <Link href={pageHref(page - 1)}>Previous</Link>
                </Button>
                <span className="text-xs text-muted-foreground">{totalCount} total entries</span>
                <Button asChild variant="outline" size="sm" disabled={!hasNext}>
                  <Link href={pageHref(page + 1)}>Next</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Actions (Current Page)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {topActions.map(([key, count]) => (
                <div key={key} className="flex items-center justify-between rounded border px-3 py-2">
                  <span>{key}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {topActions.length === 0 && (
                <div className="text-muted-foreground">No actions to summarize.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
