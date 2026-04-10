'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/hooks/use-analytics';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

type Period = 'day' | 'week' | 'month' | 'year';

interface AccountGrowthItem {
  period: string;
  total: number;
  business: number;
  customer: number;
  verified: number;
}

interface RestaurantData {
  timeline: Array<{ period: string; total: number }>;
  completeness: {
    total: number;
    hasMenu: number;
    hasHours: number;
    hasTables: number;
    hasStaff: number;
  };
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function formatPeriodLabel(raw: string, period: Period): string {
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw;

  switch (period) {
    case 'day':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'week':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    case 'year':
      return date.toLocaleDateString('en-US', { year: 'numeric' });
    default:
      return raw;
  }
}

function ChartSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

function CompletenessSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

export default function GrowthPage() {
  const { fetchData, loading, error } = useAnalytics();
  const [period, setPeriod] = useState<Period>('month');
  const [accountData, setAccountData] = useState<AccountGrowthItem[] | null>(null);
  const [restaurantData, setRestaurantData] = useState<RestaurantData | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);

  const loadAccountData = useCallback(async (p: Period) => {
    setLoadingAccounts(true);
    const result = await fetchData<AccountGrowthItem[]>('/growth/accounts', { period: p });
    if (result) setAccountData(result);
    setLoadingAccounts(false);
  }, [fetchData]);

  const loadRestaurantData = useCallback(async (p: Period) => {
    setLoadingRestaurants(true);
    const result = await fetchData<RestaurantData>('/growth/restaurants', { period: p });
    if (result) setRestaurantData(result);
    setLoadingRestaurants(false);
  }, [fetchData]);

  useEffect(() => {
    loadAccountData(period);
    loadRestaurantData(period);
  }, [period, loadAccountData, loadRestaurantData]);

  const handleRetry = () => {
    loadAccountData(period);
    loadRestaurantData(period);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-lg font-medium mb-1">Failed to load growth data</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={handleRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const completenessItems = restaurantData
    ? [
        { name: 'Menu', count: restaurantData.completeness.hasMenu, total: restaurantData.completeness.total },
        { name: 'Hours', count: restaurantData.completeness.hasHours, total: restaurantData.completeness.total },
        { name: 'Tables', count: restaurantData.completeness.hasTables, total: restaurantData.completeness.total },
        { name: 'Staff', count: restaurantData.completeness.hasStaff, total: restaurantData.completeness.total },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Account Growth */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Growth</CardTitle>
          <CardDescription>New accounts created over time</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAccounts && !accountData ? (
            <ChartSkeleton />
          ) : (
            <>
              {/* Period selector */}
              <div className="flex gap-1 mb-6">
                {PERIOD_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={period === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPeriod(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {accountData && accountData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={accountData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="period"
                      tickFormatter={(value) => formatPeriodLabel(value, period)}
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      labelFormatter={(value) => formatPeriodLabel(value as string, period)}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--card-foreground))',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="business"
                      name="Business"
                      stroke="hsl(217, 91%, 60%)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="customer"
                      name="Customer"
                      stroke="hsl(142, 71%, 45%)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                  No account data available for this period
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Restaurant Completeness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Restaurant Completeness</CardTitle>
          <CardDescription>
            How many restaurants have each feature configured
            {restaurantData ? ` (${restaurantData.completeness.total} total)` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRestaurants && !restaurantData ? (
            <CompletenessSkeleton />
          ) : restaurantData && restaurantData.completeness.total > 0 ? (
            <div className="space-y-4">
              {completenessItems.map((item) => {
                const pct = item.total > 0 ? (item.count / item.total) * 100 : 0;
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground">
                        {item.count} / {item.total}
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              No restaurant data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
