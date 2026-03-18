import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isAdminUser } from '@/lib/adminAuth';
import { PLAN_TIERS } from '@/lib/planTiers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function AdminOverviewPage() {
  if (!(await isAdminUser())) {
    redirect('/dashboard');
  }
  const since24h = new Date();
  since24h.setHours(since24h.getHours() - 24);

  const [users, totalAudits, activeAudits, failed24h, freeUsers, starterUsers, proUsers, enterpriseUsers] =
    await Promise.all([
    prisma.user.count(),
    prisma.auditRun.count(),
    prisma.auditRun.count({
      where: { status: { in: ['QUEUED', 'CRAWLING', 'RUNNING'] } },
    }),
    prisma.auditRun.count({
      where: {
        status: 'FAILED',
        createdAt: { gte: since24h },
      },
    }),
    prisma.user.count({ where: { plan: 'free' } }),
    prisma.user.count({ where: { plan: 'starter' } }),
    prisma.user.count({ where: { plan: 'pro' } }),
    prisma.user.count({ where: { plan: 'enterprise' } }),
  ]);

  const planCounts: Record<string, number> = {
    free: freeUsers,
    starter: starterUsers,
    pro: proUsers,
    enterprise: enterpriseUsers,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          User management, monitoring, feature flags, and logs.
        </p>
      </div>

      <Tabs defaultValue="kpis">
        <TabsList>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="actions">Quick Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="mt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Users</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{users}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Total Audits</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{totalAudits}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Active Audits</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{activeAudits}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Failed (24h)</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{failed24h}</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="plans" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Users by Plan</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              {['free', 'starter', 'pro', 'enterprise'].map((plan) => (
                <div key={plan} className="rounded border p-3">
                  <div className="text-sm text-muted-foreground">{plan}</div>
                  <div className="text-2xl font-bold">{planCounts[plan] ?? 0}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan Configuration (Read-Only)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(PLAN_TIERS).map(([tier, cfg]) => (
                <div key={tier} className="rounded border p-3 text-sm">
                  <div className="font-medium">
                    {cfg.label} ({tier})
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    audits/month: {cfg.auditsPerMonth} | max pages/audit: {cfg.maxPagesPerAudit}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    pdf export: {cfg.pdfExport ? 'enabled' : 'disabled'} | data export:{' '}
                    {cfg.dataExport ? 'enabled' : 'disabled'}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    included steps: {cfg.availableSteps.join(', ')}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/admin/users" className="rounded-md border p-4 hover:bg-muted/40">
              <div className="font-medium">User Management</div>
              <div className="text-sm text-muted-foreground">Edit plans and audit limits.</div>
            </Link>
            <Link href="/admin/monitoring" className="rounded-md border p-4 hover:bg-muted/40">
              <div className="font-medium">Monitoring</div>
              <div className="text-sm text-muted-foreground">Queue and audit pipeline health.</div>
            </Link>
            <Link href="/admin/features" className="rounded-md border p-4 hover:bg-muted/40">
              <div className="font-medium">Feature Flags</div>
              <div className="text-sm text-muted-foreground">Toggle features by plan.</div>
            </Link>
            <Link href="/admin/logs" className="rounded-md border p-4 hover:bg-muted/40">
              <div className="font-medium">Admin Logs</div>
              <div className="text-sm text-muted-foreground">Audit trail of admin actions.</div>
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
