import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { clerkClient, currentUser } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isAdminUser, requireAdmin } from '@/lib/adminAuth';
import { UpdateUserAdminSchema } from '@/lib/validators/admin';
import { updateManagedUser } from '@/lib/adminUsers';
import { logAdminAction } from '@/lib/adminAuditLog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

async function updateUserFromDetailAction(formData: FormData) {
  'use server';
  const userId = String(formData.get('userId') ?? '');
  let errorMessage = 'Failed+to+update+user';
  let ok = false;
  try {
    await requireAdmin();

    const disabledRaw = formData.get('disabled');
    const parsed = UpdateUserAdminSchema.parse({
      userId: formData.get('userId'),
      plan: formData.get('plan'),
      auditLimit: formData.get('auditLimit'),
      disabled:
        disabledRaw === 'true' ? true : disabledRaw === 'false' ? false : undefined,
      role: formData.get('role'),
    });

    const admin = await currentUser();
    if (!admin) {
      throw new Error('Unauthorized');
    }

    const result = await updateManagedUser({
      userId: parsed.userId,
      adminId: admin.id,
      plan: parsed.plan,
      auditLimit: parsed.auditLimit,
      disabled: parsed.disabled,
      role: parsed.role,
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
    if (result.changed.disabled) {
      await logAdminAction({
        adminId: admin.id,
        action: 'user.disabled',
        targetId: parsed.userId,
        details: { before: result.before.disabled, after: result.after.disabled },
      });
    }
    if (result.changed.role) {
      await logAdminAction({
        adminId: admin.id,
        action:
          result.after.role === 'admin'
            ? 'admin.role.granted'
            : 'admin.role.revoked',
        targetId: parsed.userId,
        details: { before: result.before.role, after: result.after.role },
      });
    }

    revalidatePath(`/admin/users/${parsed.userId}`);
    revalidatePath('/admin/users');
    ok = true;
  } catch (err) {
    if (err instanceof Error && err.message === 'CANNOT_REVOKE_SELF_ADMIN') {
      errorMessage = 'Cannot+revoke+your+own+admin+role';
    }
    ok = false;
  }

  if (ok) {
    redirect(`/admin/users/${userId}?status=success&message=User+updated`);
  }
  redirect(`/admin/users/${userId}?status=error&message=${errorMessage}`);
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  if (!(await isAdminUser())) {
    redirect('/dashboard');
  }

  const [{ id }, qs] = await Promise.all([params, searchParams]);
  const status = qs.status;
  const message = qs.message;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      auditRuns: {
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
      _count: {
        select: { auditRuns: true },
      },
    },
  });

  if (!user) notFound();
  let isDisabled = false;
  let role: 'user' | 'admin' = 'user';
  const me = await currentUser();
  const isSelf = me?.id === user.clerkId;
  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(user.clerkId);
    const metadata = (clerkUser.publicMetadata ?? {}) as Record<string, unknown>;
    isDisabled = metadata.disabled === true;
    role = metadata.role === 'admin' ? 'admin' : 'user';
  } catch {
    isDisabled = false;
    role = 'user';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin: User Detail</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Link href="/admin/users" className="text-sm text-muted-foreground hover:underline">
          Back to users
        </Link>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="audits">Recent Audits</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>Name: {user.name || 'No name'}</div>
                <div>Clerk ID: {user.clerkId}</div>
                <div>Plan: <Badge variant="outline">{user.plan}</Badge></div>
                <div>
                  Role:{' '}
                  <Badge variant={role === 'admin' ? 'destructive' : 'outline'}>
                    {role}
                  </Badge>
                </div>
                <div>Audit Limit: {user.auditLimit}</div>
                <div>
                  Account Status:{' '}
                  <Badge variant={isDisabled ? 'destructive' : 'outline'}>
                    {isDisabled ? 'Disabled' : 'Active'}
                  </Badge>
                </div>
                <div>Total Audits: {user._count.auditRuns}</div>
                <div>Created: {user.createdAt.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Account Controls</CardTitle></CardHeader>
              <CardContent>
                <form action={updateUserFromDetailAction} className="space-y-4">
                  <input type="hidden" name="userId" value={user.id} />
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Plan</label>
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
                    <label className="mb-1 block text-xs text-muted-foreground">Audit Limit</label>
                    <Input
                      type="number"
                      min={0}
                      max={5000}
                      name="auditLimit"
                      defaultValue={user.auditLimit}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Account Access</label>
                    <select
                      name="disabled"
                      defaultValue={String(isDisabled)}
                      className="h-9 w-full rounded-md border px-2 text-sm"
                    >
                      <option value="false">Active</option>
                      <option value="true">Disabled</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Account Role</label>
                    <select
                      name="role"
                      defaultValue={role}
                      className="h-9 w-full rounded-md border px-2 text-sm"
                    >
                      <option value="user" disabled={isSelf && role === 'admin'}>
                        user
                      </option>
                      <option value="admin">
                        admin
                      </option>
                    </select>
                    {isSelf && role === 'admin' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Your own admin role cannot be revoked.
                      </p>
                    )}
                  </div>

                  <div>
                    <Button type="submit" className="w-full">Save Changes</Button>
                    {message && (
                      <p
                        className={`mt-2 text-center text-xs ${
                          status === 'success' ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {message}
                      </p>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audits" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Recent Audits</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {user.auditRuns.map((a) => (
                <div key={a.id} className="rounded border p-3">
                  <div className="font-medium">{a.targetDomain}</div>
                  <div className="text-muted-foreground">
                    {a.status} | {a.createdAt.toLocaleString()}
                  </div>
                  <Link href={`/audits/${a.id}`} className="text-xs text-primary hover:underline">
                    Open audit
                  </Link>
                </div>
              ))}
              {user.auditRuns.length === 0 && (
                <div className="text-muted-foreground">No audits yet.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
