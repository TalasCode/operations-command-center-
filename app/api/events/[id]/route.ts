import { NextResponse } from "next/server";

import { workflowEngine } from "@/workflow/workflowEngine";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const event = await workflowEngine.getEventDetail(id);

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  return NextResponse.json(event);
}
