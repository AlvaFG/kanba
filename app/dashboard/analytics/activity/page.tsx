'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Users, Award, Star, Coins } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAnalytics } from '@/hooks/use-analytics';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// --- Types ---

type Period = 'day' | 'week' | 'month' | 'year';

interface EngagementData {
  waiterCalls: Array<{ period: string; count: number }>;
  reservations: Array<{ period: string; count: number }>;
  feedback: Array<{ period: string; count: number; avgRating: number | null }>;
  tableSessions: Array<{ period: string; count: number; avgDurationMin: number | null }>;
}

interface MergedEngagementPoint {
  period: string;
  waiterCalls: number;
  reservations: number;
  feedback: number;
  tableSessions: number;
}

interface LoyaltyData {
  programs: { total: number; active: number };
  points: { earned: number; redeemed: number };
  balances: { customers: number; totalPoints: number };
}

interface StaffData {
  byRestaurant: Array<{ id: string; name: string; total: number; active: number }>;
  byRole: Array<{ role: string; count: number }>;
}

// --- Constants ---

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const ENGAGEMENT_LINES = [
  { key: 'waiterCalls', name: 'Waiter Calls', color: 'hsl(217, 91%, 60%)' },
  { key: 'reservations', name: 'Reservations', color: 'hsl(142, 71%, 45%)' },
  { key: 'feedback', name: 'Feedback', color: 'hsl(38, 92%, 50%)' },
  { key: 'tableSessions', name: 'Table Sessions', color: 'hsl(280, 65%, 60%)' },
] as const;

const ROLE_COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(280, 65%, 60%)',
  'hsl(0, 72%, 51%)',
  'hsl(190, 75%, 45%)',
];

// --- Helpers ---

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

function mergeEngagementData(data: EngagementData): MergedEngagementPoint[] {
  const map = new Map<string, MergedEngagementPoint>();

  const ensure = (period: string) => {
    if (!map.has(period)) {
      map.set(period, { period, waiterCalls: 0, reservations: 0, feedback: 0, tableSessions: 0 });
    }
    return map.get(period)!;
  };

  data.waiterCalls.forEach((d) => { ensure(d.period).waiterCalls = d.count; });
  data.reservations.forEach((d) => { ensure(d.period).reservations = d.count; });
  data.feedback.forEach((d) => { ensure(d.period).feedback = d.count; });
  data.tableSessions.forEach((d) => { ensure(d.period).tableSessions = d.count; });

  return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

// --- Skeletons ---

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

function KpiGridSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2 p-4 rounded-lg border">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

function StaffSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[250px] w-full" />
    </div>
  );
}

// --- Tooltip ---

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--card-foreground))',
};

// --- Page Component ---

export default function ActivityPage() {
  const { fetchData, loading, error } = useAnalytics();
  const [period, setPeriod] = useState<Period>('month');

  const [engagementData, setEngagementData] = useState<MergedEngagementPoint[] | null>(null);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [staffData, setStaffData] = useState<StaffData | null>(null);

  const [loadingEngagement, setLoadingEngagement] = useState(true);
  const [loadingLoyalty, setLoadingLoyalty] = useState(true);
  const [loadingStaff, setLoadingStaff] = useState(true);

  const loadEngagement = useCallback(async (p: Period) => {
    setLoadingEngagement(true);
    const result = await fetchData<EngagementData>('/activity/engagement', { period: p });
    if (result) {
      setEngagementData(mergeEngagementData(result));
    }
    setLoadingEngagement(false);
  }, [fetchData]);

  const loadLoyalty = useCallback(async () => {
    setLoadingLoyalty(true);
    const result = await fetchData<LoyaltyData>('/activity/loyalty');
    if (result) setLoyaltyData(result);
    setLoadingLoyalty(false);
  }, [fetchData]);

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true);
    const result = await fetchData<StaffData>('/activity/staff');
    if (result) setStaffData(result);
    setLoadingStaff(false);
  }, [fetchData]);

  useEffect(() => {
    loadEngagement(period);
  }, [period, loadEngagement]);

  useEffect(() => {
    loadLoyalty();
    loadStaff();
  }, [loadLoyalty, loadStaff]);

  const handleRetry = () => {
    loadEngagement(period);
    loadLoyalty();
    loadStaff();
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-lg font-medium mb-1">Failed to load activity data</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={handleRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Engagement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Engagement</CardTitle>
          <CardDescription>Waiter calls, reservations, feedback, and table sessions over time</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingEngagement && !engagementData ? (
            <ChartSkeleton />
          ) : (
            <>
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

              {engagementData && engagementData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={engagementData}>
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
                      contentStyle={tooltipStyle}
                    />
                    <Legend />
                    {ENGAGEMENT_LINES.map((line) => (
                      <Line
                        key={line.key}
                        type="monotone"
                        dataKey={line.key}
                        name={line.name}
                        stroke={line.color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                  No engagement data available for this period
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Loyalty */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Loyalty</CardTitle>
          <CardDescription>Loyalty programs, points activity, and customer balances</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLoyalty && !loyaltyData ? (
            <KpiGridSkeleton />
          ) : loyaltyData ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              {/* Programs */}
              <div className="rounded-lg border p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Award className="h-4 w-4" />
                  Programs
                </div>
                <div className="text-2xl font-bold">{formatNumber(loyaltyData.programs.total)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(loyaltyData.programs.active)} active
                </p>
              </div>

              {/* Points */}
              <div className="rounded-lg border p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Star className="h-4 w-4" />
                  Points
                </div>
                <div className="text-2xl font-bold">{formatNumber(loyaltyData.points.earned)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(loyaltyData.points.redeemed)} redeemed
                </p>
              </div>

              {/* Balances */}
              <div className="rounded-lg border p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Coins className="h-4 w-4" />
                  Customer Balances
                </div>
                <div className="text-2xl font-bold">{formatNumber(loyaltyData.balances.customers)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(loyaltyData.balances.totalPoints)} total points held
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[120px] text-muted-foreground text-sm">
              No loyalty data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Staff */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Staff</CardTitle>
          <CardDescription>Staff distribution by restaurant and role</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStaff && !staffData ? (
            <StaffSkeleton />
          ) : staffData ? (
            <div className="space-y-8">
              {/* Staff by Restaurant Table */}
              {staffData.byRestaurant.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium mb-3">By Restaurant</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Restaurant</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffData.byRestaurant.map((restaurant) => (
                        <TableRow key={restaurant.id}>
                          <TableCell className="font-medium">{restaurant.name}</TableCell>
                          <TableCell className="text-right">{formatNumber(restaurant.total)}</TableCell>
                          <TableCell className="text-right">{formatNumber(restaurant.active)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[100px] text-muted-foreground text-sm">
                  No staff restaurant data available
                </div>
              )}

              {/* Staff Roles Bar Chart */}
              {staffData.byRole.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium mb-3">By Role</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={staffData.byRole} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="role"
                        width={100}
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar
                        dataKey="count"
                        name="Staff"
                        fill="hsl(217, 91%, 60%)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[100px] text-muted-foreground text-sm">
                  No staff role data available
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              No staff data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
