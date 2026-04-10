import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.ANALYTICS_API_URL || '';
const API_KEY = process.env.ANALYTICS_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${API_URL}/${path}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': API_KEY },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const url = `${API_URL}/${path}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to refresh analytics data' },
      { status: 500 }
    );
  }
}
