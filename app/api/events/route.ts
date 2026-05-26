import { NextRequest, NextResponse } from "next/server";

import { workflowEngine } from "@/workflow/workflowEngine";

export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view");

  if (view === "dashboard") {
    const data = await workflowEngine.getDashboardData();
    return NextResponse.json(data);
  }

  if (view === "review-queue") {
    const data = await workflowEngine.listReviewQueue();
    return NextResponse.json({ items: data });
  }

  if (view === "samples") {
    return NextResponse.json({ items: workflowEngine.getSampleEvents() });
  }

  const data = await workflowEngine.listEvents({
    stream: request.nextUrl.searchParams.get("stream") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    search: request.nextUrl.searchParams.get("search") ?? undefined,
    review: request.nextUrl.searchParams.get("review") ?? undefined
  });

  return NextResponse.json({ items: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await workflowEngine.processEvent(body);
  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
}
