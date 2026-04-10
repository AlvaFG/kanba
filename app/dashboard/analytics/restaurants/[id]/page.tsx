'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Star,
  Users,
  ShoppingBag,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

// --- Types ---

interface RestaurantDetail {
  info: {
    id: string;
    name: string;
    ownerName: string;
    ownerEmail: string;
    address: string;
    phone: string;
    email: string;
    createdAt: string;
    isOpen: boolean;
  };
  metrics: {
    totalOrders: number;
    revenue: number;
    avgTicket: number;
    avgRating: number | null;
    totalReviews: number;
  };
  completeness: {
    hasMenu: boolean;
    hasHours: boolean;
    hasTables: boolean;
    hasStaff: boolean;
    hasEpagos: boolean;
  };
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  staff: {
    total: number;
    active: number;
    byRole: Array<{ role: string; count: number }>;
  };
}

// --- Helpers ---

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatARS(value: number): string {
  return `$${value.toLocaleString('es-AR')}`;
}

// --- Skeletons ---

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// --- Completeness Item ---

function CompletenessItem({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {value ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}

// --- Page ---

export default function RestaurantDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { fetchData, loading, error } = useAnalytics();
  const [data, setData] = useState<RestaurantDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const loadData = useCallback(async () => {
    setNotFound(false);
    const result = await fetchData<RestaurantDetail>(`/restaurants/${id}`);
    if (result) {
      setData(result);
    } else {
      setNotFound(true);
    }
  }, [fetchData, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Error state ---
  if (error) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/analytics/restaurants">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to restaurants
          </Button>
        </Link>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-lg font-medium mb-1">Failed to load restaurant</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // --- Loading state ---
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/analytics/restaurants">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to restaurants
          </Button>
        </Link>
        <PageSkeleton />
      </div>
    );
  }

  // --- 404 state ---
  if (notFound && !data) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/analytics/restaurants">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to restaurants
          </Button>
        </Link>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-1">Restaurant not found</p>
          <p className="text-sm text-muted-foreground">
            The restaurant you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { info, metrics, completeness, topItems, staff } = data;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/dashboard/analytics/restaurants">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to restaurants
        </Button>
      </Link>

      {/* Restaurant info card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{info.name}</h1>
                <Badge
                  className={
                    info.isOpen
                      ? 'bg-green-500/15 text-green-600 border-green-500/20 hover:bg-green-500/15'
                      : 'bg-red-500/15 text-red-600 border-red-500/20 hover:bg-red-500/15'
                  }
                >
                  {info.isOpen ? 'Open' : 'Closed'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{info.ownerName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span>{info.ownerEmail}</span>
                </div>
                {info.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{info.phone}</span>
                  </div>
                )}
                {info.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{info.address}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Created {formatDate(info.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ShoppingBag className="h-4 w-4" />
              <span>Total Orders</span>
            </div>
            <p className="text-2xl font-bold">{metrics.totalOrders.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span>Revenue</span>
            </div>
            <p className="text-2xl font-bold">{formatARS(metrics.revenue)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span>Avg Ticket</span>
            </div>
            <p className="text-2xl font-bold">{formatARS(metrics.avgTicket)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Star className="h-4 w-4" />
              <span>Avg Rating</span>
            </div>
            <p className="text-2xl font-bold">
              {metrics.avgRating !== null ? (
                <>
                  {metrics.avgRating.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">/5</span>
                </>
              ) : (
                <span className="text-base font-normal text-muted-foreground">No reviews</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Completeness + Staff */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Completeness checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Setup Completeness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CompletenessItem label="Menu" value={completeness.hasMenu} />
            <CompletenessItem label="Hours" value={completeness.hasHours} />
            <CompletenessItem label="Tables" value={completeness.hasTables} />
            <CompletenessItem label="Staff" value={completeness.hasStaff} />
            <CompletenessItem label="ePagos" value={completeness.hasEpagos} />
          </CardContent>
        </Card>

        {/* Staff summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{staff.total}</span> total,{' '}
              <span className="font-medium text-foreground">{staff.active}</span> active
            </p>
            {staff.byRole.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {staff.byRole.map((r) => (
                  <Badge key={r.role} variant="secondary">
                    {r.role}: {r.count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 5 Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 5 Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topItems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topItems.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">{item.quantity.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatARS(item.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No items sold yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
