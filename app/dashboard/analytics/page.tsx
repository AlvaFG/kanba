'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Users, Store, ShoppingCart, DollarSign, AlertCircle } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/hooks/use-analytics';

interface OverviewData {
  accounts: { total: number; business: number; customer: number };
  restaurants: { total: number; withMenu: number };
  orders: {
    total: number;
    revenue: number;
    avgTicket: number;
    last30d: { total: number; revenue: number };
    prev30d: { total: number; revenue: number };
  };
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function calcChange(current: number, previous: number): string {
  if (previous === 0) return '+0%';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(0)}%`;
}

function KpiSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

// Simple sparkline-style mock data for the mini chart
const sparklineData = [
  { d: '1', v: 12 }, { d: '2', v: 18 }, { d: '3', v: 15 },
  { d: '4', v: 22 }, { d: '5', v: 28 }, { d: '6', v: 25 },
  { d: '7', v: 30 }, { d: '8', v: 35 }, { d: '9', v: 32 },
  { d: '10', v: 38 }, { d: '11', v: 42 }, { d: '12', v: 40 },
];

export default function AnalyticsOverviewPage() {
  const { fetchData, refresh, loading, error } = useAnalytics();
  const [data, setData] = useState<OverviewData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const result = await fetchData<OverviewData>('/overview');
    if (result) setData(result);
  }, [fetchData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadData();
    setRefreshing(false);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-lg font-medium mb-1">Failed to load analytics</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={loadData}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Overview</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {loading && !data ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : data ? (
          <>
            {/* Total Accounts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.accounts.total.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {data.accounts.business.toLocaleString()} business, {data.accounts.customer.toLocaleString()} customer
                </p>
              </CardContent>
            </Card>

            {/* Restaurants */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Restaurants</CardTitle>
                <Store className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.restaurants.total.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {data.restaurants.withMenu.toLocaleString()} with menu
                </p>
              </CardContent>
            </Card>

            {/* Total Orders */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.orders.total.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Avg ticket: {formatCurrency(data.orders.avgTicket)}
                </p>
              </CardContent>
            </Card>

            {/* Revenue */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.orders.revenue)}</div>
                <p className="text-xs text-muted-foreground">
                  {calcChange(data.orders.last30d.revenue, data.orders.prev30d.revenue)} vs prev 30d
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Orders Over Time Mini Chart */}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Orders Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData}>
                  <defs>
                    <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelFormatter={(label) => `Day ${label}`}
                    formatter={(value: number) => [value, 'Orders']}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#orderGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
