import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { replaceDailyCallIns } from "@/lib/daily-callins";
import { invalidateOperationsDashboardCache } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "super-admin" && session.role !== "admin") {
    return NextResponse.json({ error: "Only Admin or Super Admin can approve call-ins." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body as Partial<{
    dateIso: string;
    role: "technicians" | "riggers" | "shipwrights" | "acTechs";
    workerLabels: string[];
  }>;
  const dateIso = normalizeDateIso(payload.dateIso);
  if (!dateIso) {
    return NextResponse.json({ error: "dateIso must be YYYY-MM-DD." }, { status: 400 });
  }
  if (
    payload.role !== "technicians" &&
    payload.role !== "riggers" &&
    payload.role !== "shipwrights" &&
    payload.role !== "acTechs"
  ) {
    return NextResponse.json({ error: "role is invalid." }, { status: 400 });
  }
  const workerLabels = Array.isArray(payload.workerLabels)
    ? payload.workerLabels.filter((value): value is string => typeof value === "string")
    : [];

  const saved = await replaceDailyCallIns({
    dateIso,
    role: payload.role,
    workerLabels,
    updatedBy: session.email,
  });
  if (!saved) {
    return NextResponse.json({ error: "Could not save call-in approvals." }, { status: 500 });
  }

  invalidateOperationsDashboardCache();
  return NextResponse.json({
    ok: true,
    dateIso,
    role: payload.role,
    workerLabels,
  });
}

function normalizeDateIso(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}
