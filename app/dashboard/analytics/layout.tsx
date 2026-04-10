'use client';

import { usePathname, useRouter } from 'next/navigation';

const tabs = [
  { label: 'Overview', href: '/dashboard/analytics' },
  { label: 'Growth', href: '/dashboard/analytics/growth' },
  { label: 'Transactions', href: '/dashboard/analytics/transactions' },
  { label: 'Activity', href: '/dashboard/analytics/activity' },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Aramal platform metrics and insights</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => {
          const isActive = tab.href === '/dashboard/analytics'
            ? pathname === tab.href
            : pathname?.startsWith(tab.href);
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {children}
    </div>
  );
}
