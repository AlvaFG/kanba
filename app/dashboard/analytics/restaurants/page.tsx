'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Download, CheckCircle, XCircle, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface RestaurantsResponse {
  data: Array<{
    id: string;
    name: string;
    ownerName: string;
    ownerEmail: string;
    createdAt: string;
    hasMenu: boolean;
    hasHours: boolean;
    hasTables: boolean;
    hasStaff: boolean;
    hasEpagos: boolean;
  }>;
  total: number;
  page: number;
  limit: number;
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

function CompletenessIcon({ value }: { value: boolean }) {
  return value ? (
    <CheckCircle className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-muted-foreground/40" />
  );
}

// --- Skeletons ---

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// --- Page ---

export default function RestaurantsPage() {
  const router = useRouter();
  const { fetchData, loading, error } = useAnalytics();
  const [data, setData] = useState<RestaurantsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  const loadData = useCallback(async () => {
    const params: Record<string, string> = {
      page: String(page),
      limit: '25',
    };
    if (debouncedSearch) params.search = debouncedSearch;

    const result = await fetchData<RestaurantsResponse>('/restaurants', params);
    if (result) setData(result);
  }, [fetchData, debouncedSearch, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = () => {
    const url = new URL('/api/analytics/export/restaurants', window.location.origin);
    if (debouncedSearch) url.searchParams.set('search', debouncedSearch);
    const a = document.createElement('a');
    a.href = url.toString();
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-lg font-medium mb-1">Failed to load restaurants</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={loadData}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Restaurants</h2>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search restaurants..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="p-4">
              <TableSkeleton />
            </div>
          ) : data && data.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-center">Menu</TableHead>
                  <TableHead className="text-center">Hours</TableHead>
                  <TableHead className="text-center">Tables</TableHead>
                  <TableHead className="text-center">Staff</TableHead>
                  <TableHead className="text-center">ePagos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((restaurant) => (
                  <TableRow
                    key={restaurant.id}
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => router.push(`/dashboard/analytics/restaurants/${restaurant.id}`)}
                  >
                    <TableCell className="font-medium">{restaurant.name}</TableCell>
                    <TableCell>
                      <div>{restaurant.ownerName}</div>
                      <div className="text-xs text-muted-foreground">{restaurant.ownerEmail}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(restaurant.createdAt)}</TableCell>
                    <TableCell className="text-center"><CompletenessIcon value={restaurant.hasMenu} /></TableCell>
                    <TableCell className="text-center"><CompletenessIcon value={restaurant.hasHours} /></TableCell>
                    <TableCell className="text-center"><CompletenessIcon value={restaurant.hasTables} /></TableCell>
                    <TableCell className="text-center"><CompletenessIcon value={restaurant.hasStaff} /></TableCell>
                    <TableCell className="text-center"><CompletenessIcon value={restaurant.hasEpagos} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : data && data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">No restaurants found</p>
              {debouncedSearch && (
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data.total.toLocaleString()} restaurant{data.total !== 1 ? 's' : ''} total
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
