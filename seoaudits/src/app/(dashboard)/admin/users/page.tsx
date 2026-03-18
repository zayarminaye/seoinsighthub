import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isAdminUser, requireAdmin } from '@/lib/adminAuth';
import { UpdateUserAdminSchema } from '@/lib/validators/admin';
import { logAdminAction } from '@/lib/adminAuditLog';
import { updateManagedUser } from '@/lib/adminUsers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

async function updateUserAction(formData: FormData) {
  'use server';
  const userId = String(formData.get('userId') ?? '');
  let ok = false;
  try {
    await requireAdmin();

    const parsed = UpdateUserAdminSchema.parse({
      userId: formData.get('userId'),
      plan: formData.get('plan'),
      auditLimit: formData.get('auditLimit'),
      disabled: undefined,
    });

    const admin = await currentUser();
    if (admin) {
      const result = await updateManagedUser({
        userId: parsed.userId,
        adminId: admin.id,
        plan: parsed.plan,
        auditLimit: parsed.auditLimit,
      });

      if (result.changed.plan) {
        await logAdminAction({
          adminId: admin.id,
          action: 'user.plan.changed',
          targetId: parsed.userId,
          details: { before: result.before.plan, after: result.after.plan },
        });
      }
      if (result.changed.auditLimit) {
        await logAdminAction({
          adminId: admin.id,
          action: 'user.auditLimit.changed',
          targetId: parsed.userId,
          details: { before: result.before.auditLimit, after: result.after.auditLimit },
        });
      }
    }

    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${parsed.userId}`);
    ok = true;
  } catch {
    ok = false;
  }

  if (ok) {
    redirect(`/admin/users?status=success&target=${userId}&message=User+updated`);
  }
  redirect(`/admin/users?status=error&target=${userId}&message=Failed+to+update+user`);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; status?: string; message?: string; target?: string }>;
}) {
  if (!(await isAdminUser())) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const planFilter = (params.plan ?? '').trim();
  const status = params.status;
  const message = params.message;
  const target = params.target;

  const [users, planRows] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...(q && {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      }),
      ...(planFilter &&
        ['free', 'starter', 'pro', 'enterprise'].includes(planFilter) && {
          plan: planFilter,
        }),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
      include: {
        _count: {
          select: {
            auditRuns: true,
          },
        },
      },
    }),
    prisma.user.groupBy({
      by: ['plan'],
      _count: { _all: true },
    }),
  ]);

  const planCounts = planRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.plan] = row._count._all;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin: User Management</h1>
        <p className="text-sm text-muted-foreground">
          Update user plan and monthly audit quota.
        </p>
      </div>
      <Tabs defaultValue="manage">
        <TabsList>
          <TabsTrigger value="manage">Manage Users</TabsTrigger>
          <TabsTrigger value="plans">Plan Distribution</TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <form className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Input name="q" placeholder="Search email or name" defaultValue={q} />
                <select
                  name="plan"
                  defaultValue={planFilter}
                  className="h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="">All plans</option>
                  <option value="free">free</option>
                  <option value="starter">starter</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
                <Button type="submit" variant="outline">Filter</Button>
                <Button asChild type="button" variant="ghost">
                  <Link href="/admin/users">Reset</Link>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Users ({users.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((user) => (
                  <form
                    key={user.id}
                    action={updateUserAction}
                    className="grid grid-cols-1 gap-3 rounded-md border p-3 md:grid-cols-6"
                  >
                    <input type="hidden" name="userId" value={user.id} />

                    <div className="md:col-span-2">
                      <div className="text-sm font-medium">{user.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {user.name || 'No name'} | {user._count.auditRuns} audits
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Plan
                      </label>
                      <select
                        name="plan"
                        defaultValue={user.plan}
                        className="h-9 w-full rounded-md border px-2 text-sm"
                      >
                        <option value="free">free</option>
                        <option value="starter">starter</option>
                        <option value="pro">pro</option>
                        <option value="enterprise">enterprise</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Audit Limit
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={5000}
                        name="auditLimit"
                        defaultValue={user.auditLimit}
                      />
                    </div>

                    <div className="md:col-span-2 flex items-end justify-end">
                      <div className="text-right">
                        <div>
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="mr-2 text-sm text-muted-foreground hover:underline"
                          >
                            View
                          </Link>
                          <Button type="submit" size="sm">
                            Save
                          </Button>
                        </div>
                        {target === user.id && message && (
                          <p
                            className={`mt-2 text-xs ${
                              status === 'success' ? 'text-green-700' : 'text-red-700'
                            }`}
                          >
                            {message}
                          </p>
                        )}
                      </div>
                    </div>
                  </form>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {['free', 'starter', 'pro', 'enterprise'].map((plan) => (
                <div key={plan} className="rounded border p-3">
                  <div className="text-sm text-muted-foreground">{plan}</div>
                  <div className="text-2xl font-bold">{planCounts[plan] ?? 0}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
