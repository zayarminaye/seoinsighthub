import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const role = (user?.publicMetadata as { role?: string } | undefined)?.role;
  const isAdmin = role === 'admin';
  const navLinkClass =
    'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-14 items-center">
            <Link href="/dashboard" className="text-base font-semibold tracking-tight">
              SEO Audit
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <nav className="hidden items-center gap-1 md:flex">
                <Link href="/dashboard" className={navLinkClass}>
                  Dashboard
                </Link>
                {isAdmin && (
                  <Link href="/admin/users" className={navLinkClass}>
                    Admin
                  </Link>
                )}
                <Link href="/settings" className={navLinkClass}>
                  Settings
                </Link>
              </nav>
              <Link
                href="/audits/new"
                className="hidden rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
              >
                New Audit
              </Link>
              <Link
                href="/audits/new"
                aria-label="New Audit"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:hidden"
              >
                +
              </Link>
              <UserButton />
            </div>
          </div>

          <nav className="flex flex-wrap gap-2 pb-3 md:hidden">
            <Link
              href="/dashboard"
              className="rounded-md border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Dashboard
            </Link>
            {isAdmin && (
              <Link
                href="/admin/users"
                className="rounded-md border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Admin
              </Link>
            )}
            <Link
              href="/settings"
              className="rounded-md border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Settings
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
