'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { useAnalytics } from '@/hooks/use-analytics';

// --- Types ---

interface OrdersTimelineItem {
  period: string;
  count: number;
  revenue: number;
  avgTicket: number;
}

interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
}

interface OrdersData {
  timeline: OrdersTimelineItem[];
  topItems: TopItem[];
}

interface RevenueByRestaurant {
  id: string;
  name: string;
  revenue: number;
  orders: number;
}

interface PaymentMethodBreakdown {
  method: string;
  count: number;
  total: number;
}

interface RevenueData {
  byRestaurant: RevenueByRestaurant[];
  byPaymentMethod: PaymentMethodBreakdown[];
}

// --- Helpers ---

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PIE_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

// --- Chart configs ---

const ordersChartConfig = {
  count: {
    label: 'Orders',
    color: 'hsl(var(--chart-1))',
  },
  revenue: {
    label: 'Revenue',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

const topItemsChartConfig = {
  quantity: {
    label: 'Quantity',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

// --- Skeleton components ---

function ChartSkeleton({ height = 'h-[300px]' }: { height?: string }) {
  return (
    <div className={`${height} w-full space-y-3`}>
      <div className="flex items-end gap-2 h-full">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

// --- Main page ---

export default function TransactionsPage() {
  const { fetchData, refresh, loading, error } = useAnalytics();
  const [period, setPeriod] = useState('month');
  const [ordersData, setOrdersData] = useState<OrdersData | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadError(null);
    const [orders, revenue] = await Promise.all([
      fetchData<OrdersData>('/transactions/orders', { period }),
      fetchData<RevenueData>('/transactions/revenue', { period }),
    ]);
    if (orders) setOrdersData(orders);
    if (revenue) setRevenueData(revenue);
    if (!orders && !revenue) {
      setLoadError('Failed to load transaction data');
    }
  }, [fetchData, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadData();
    setRefreshing(false);
  };

  // Build pie chart config dynamically from payment methods
  const paymentChartConfig: ChartConfig = revenueData
    ? Object.fromEntries(
        revenueData.byPaymentMethod.map((pm, i) => [
          pm.method,
          {
            label: pm.method,
            color: PIE_COLORS[i % PIE_COLORS.length],
          },
        ])
      )
    : {};

  if (error || loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-lg font-medium mb-1">Failed to load transactions</p>
        <p className="text-sm text-muted-foreground mb-4">{error || loadError}</p>
        <Button variant="outline" onClick={loadData}>
          Retry
        </Button>
      </div>
    );
  }

  const isLoading = loading && !ordersData && !revenueData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="day" className="rounded-lg">Day</SelectItem>
              <SelectItem value="week" className="rounded-lg">Week</SelectItem>
              <SelectItem value="month" className="rounded-lg">Month</SelectItem>
              <SelectItem value="year" className="rounded-lg">Year</SelectItem>
            </SelectContent>
          </Select>
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
      </div>

      {/* Section 1: Orders Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders Timeline</CardTitle>
          <CardDescription>
            Order count and revenue over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ChartSkeleton height="h-[350px]" />
          ) : ordersData?.timeline.length ? (
            <ChartContainer
              config={ordersChartConfig}
              className="aspect-auto h-[350px] w-full"
            >
              <AreaChart data={ordersData.timeline}>
                <defs>
                  <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="period"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={70}
                  tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      formatter={(value, name) => {
                        if (name === 'revenue') {
                          return (
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatCurrency(value as number)}
                            </span>
                          );
                        }
                        return (
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {(value as number).toLocaleString()}
                          </span>
                        );
                      }}
                    />
                  }
                />
                <Area
                  yAxisId="left"
                  dataKey="count"
                  type="monotone"
                  fill="url(#fillCount)"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="right"
                  dataKey="revenue"
                  type="monotone"
                  fill="url(#fillRevenue)"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No order data available for this period.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Top 10 Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 Items</CardTitle>
          <CardDescription>
            Most ordered items by quantity
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ChartSkeleton height="h-[400px]" />
          ) : ordersData?.topItems.length ? (
            <ChartContainer
              config={topItemsChartConfig}
              className="aspect-auto h-[400px] w-full"
            >
              <BarChart
                data={ordersData.topItems.slice(0, 10)}
                layout="vertical"
                margin={{ left: 8 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  tickMargin={8}
                  className="text-xs"
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      formatter={(value) => (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {(value as number).toLocaleString()} units
                        </span>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="quantity"
                  fill="var(--color-quantity)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No item data available for this period.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Revenue by Restaurant + Payment Methods */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by Restaurant */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Restaurant</CardTitle>
            <CardDescription>
              Breakdown by restaurant
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton rows={5} />
            ) : revenueData?.byRestaurant.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Restaurant</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueData.byRestaurant.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(r.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.orders.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">
                No restaurant data available for this period.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Methods</CardTitle>
            <CardDescription>
              Distribution by payment type
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton height="h-[300px]" />
            ) : revenueData?.byPaymentMethod.length ? (
              <div className="space-y-4">
                <ChartContainer
                  config={paymentChartConfig}
                  className="aspect-square h-[250px] w-full"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatCurrency(value as number)}
                            </span>
                          )}
                          nameKey="method"
                        />
                      }
                    />
                    <Pie
                      data={revenueData.byPaymentMethod}
                      dataKey="total"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      strokeWidth={2}
                    >
                      {revenueData.byPaymentMethod.map((entry, index) => (
                        <Cell
                          key={entry.method}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                {/* Legend below pie chart */}
                <div className="grid gap-2">
                  {revenueData.byPaymentMethod.map((pm, i) => (
                    <div key={pm.method} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-sm shrink-0"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span>{pm.method}</span>
                      </div>
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <span className="tabular-nums">{pm.count.toLocaleString()} txns</span>
                        <span className="tabular-nums font-medium text-foreground">
                          {formatCurrency(pm.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">
                No payment data available for this period.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
