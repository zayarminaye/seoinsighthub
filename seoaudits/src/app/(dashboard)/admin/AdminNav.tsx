'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';

const ITEMS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/monitoring', label: 'Monitoring' },
  { href: '/admin/features', label: 'Features' },
  { href: '/admin/logs', label: 'Logs' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/admin' && pathname.startsWith(item.href + '/'));

        return (
          <Button
            key={item.href}
            asChild
            size="sm"
            variant={active ? 'default' : 'outline'}
          >
            <Link href={item.href}>{item.label}</Link>
          </Button>
        );
      })}
    </nav>
  );
}

