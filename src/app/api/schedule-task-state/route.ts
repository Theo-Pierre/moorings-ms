import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { invalidateOperationsDashboardCache } from "@/lib/operations-data";
import {
  listCanonicalTaskCompletions,
  listTaskCompletions,
  setTaskCompletion,
} from "@/lib/schedule-task-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const reportDateIso = normalizeReportDate(url.searchParams.get("date") ?? "");
  if (!reportDateIso) {
    return NextResponse.json({ error: "date query parameter must be YYYY-MM-DD." }, { status: 400 });
  }
  const dueDates = normalizeDueDates(url.searchParams.get("dueDates") ?? "");

  const [completions, canonicalCompletions] = await Promise.all([
    listTaskCompletions(reportDateIso),
    listCanonicalTaskCompletions(dueDates.length > 0 ? dueDates : [reportDateIso]),
  ]);
  const doneTaskIds = Object.keys(completions);
  return NextResponse.json({
    ok: true,
    reportDateIso,
    doneTaskIds,
    completions,
    canonicalCompletions,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body as Partial<{
    reportDateIso: string;
    taskId: string;
    done: boolean;
    completedBy: string;
    completedAtIso: string;
    note: string;
    preCompleted: boolean;
  }>;

  const reportDateIso = normalizeReportDate(payload.reportDateIso ?? "");
  if (!reportDateIso) {
    return NextResponse.json({ error: "reportDateIso must be YYYY-MM-DD." }, { status: 400 });
  }
  const taskId = normalizeTaskId(payload.taskId ?? "");
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }
  if (typeof payload.done !== "boolean") {
    return NextResponse.json({ error: "done must be a boolean." }, { status: 400 });
  }

  const saved = await setTaskCompletion({
    reportDateIso,
    taskId,
    done: payload.done,
    updatedBy: session.email,
    completedBy: typeof payload.completedBy === "string" ? payload.completedBy : session.name,
    completedAtIso: typeof payload.completedAtIso === "string" ? payload.completedAtIso : undefined,
    note: typeof payload.note === "string" ? payload.note : undefined,
    preCompleted: typeof payload.preCompleted === "boolean" ? payload.preCompleted : undefined,
  });
  if (!saved) {
    return NextResponse.json({ error: "Could not update shared task state." }, { status: 500 });
  }

  invalidateOperationsDashboardCache();

  return NextResponse.json({
    ok: true,
    reportDateIso,
    taskId,
    done: payload.done,
    completedBy: typeof payload.completedBy === "string" ? payload.completedBy : session.name,
    completedAtIso:
      typeof payload.completedAtIso === "string"
        ? payload.completedAtIso
        : new Date().toISOString(),
  });
}

function normalizeReportDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function normalizeTaskId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512 || trimmed.includes("/")) {
    return "";
  }
  return trimmed;
}

function normalizeDueDates(raw: string): string[] {
  return [...new Set(raw
    .split(",")
    .map((value) => normalizeReportDate(value))
    .filter(Boolean))];
}
