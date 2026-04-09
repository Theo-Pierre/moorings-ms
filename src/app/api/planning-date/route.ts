import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { invalidateOperationsDashboardCache } from "@/lib/operations-data";
import {
  getPlanningDateOverride,
  setPlanningDateOverride,
} from "@/lib/planning-date-override";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const planningDateOverride = await getPlanningDateOverride();
  return NextResponse.json({
    ok: true,
    planningDateOverride,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "super-admin") {
    return NextResponse.json({ error: "Only Super Admin can set planning date override." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body as Partial<{ dateIso: string | null }>;
  const rawDateIso = typeof payload.dateIso === "string" ? payload.dateIso.trim() : "";
  const dateIso = rawDateIso || null;

  const saved = await setPlanningDateOverride({
    dateIso,
    updatedBy: session.email,
  });
  if (!saved) {
    return NextResponse.json({ error: "Could not save planning date override." }, { status: 500 });
  }

  invalidateOperationsDashboardCache();
  const planningDateOverride = await getPlanningDateOverride();
  return NextResponse.json({
    ok: true,
    planningDateOverride,
  });
}
