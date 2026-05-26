import { NextRequest, NextResponse } from "next/server";

import { workflowEngine } from "@/workflow/workflowEngine";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const item = await workflowEngine.updateReviewItem(id, body);

    if (!item) {
      return NextResponse.json({ error: "Review item not found." }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
