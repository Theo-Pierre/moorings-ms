import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { invalidateOperationsDashboardCache } from "@/lib/operations-data";
import { addTeamOverride, type TeamRoleKey } from "@/lib/team-overrides";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "super-admin") {
    return NextResponse.json({ error: "Only Super Admin can edit team members." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body as Partial<{
    action: "add" | "remove" | "leave" | "return" | "update";
    role: TeamRoleKey;
    label: string;
    positionLabel: string;
    previousRole: TeamRoleKey;
    previousLabel: string;
    daysOff: string[];
  }>;

  if (
    !payload.action ||
    (payload.action !== "add" &&
      payload.action !== "remove" &&
      payload.action !== "leave" &&
      payload.action !== "return" &&
      payload.action !== "update")
  ) {
    return NextResponse.json({ error: "action must be add, remove, leave, return, or update." }, { status: 400 });
  }
  if (!isTeamRole(payload.role)) {
    return NextResponse.json({ error: "Invalid team role." }, { status: 400 });
  }

  const label = typeof payload.label === "string" ? payload.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const daysOff = normalizeDaysOff(payload.daysOff ?? []);
  const positionLabel = typeof payload.positionLabel === "string" ? payload.positionLabel.trim() : "";
  const previousRole = isTeamRole(payload.previousRole) ? payload.previousRole : null;
  const previousLabel = typeof payload.previousLabel === "string" ? payload.previousLabel.trim() : "";

  const record = await addTeamOverride({
    action: payload.action,
    role: payload.role,
    label,
    positionLabel,
    previousRole,
    previousLabel,
    daysOff,
    createdBy: session.email,
  });

  if (!record) {
    return NextResponse.json({ error: "Could not save team change." }, { status: 500 });
  }

  invalidateOperationsDashboardCache();

  return NextResponse.json({ ok: true, record });
}

function isTeamRole(value: unknown): value is TeamRoleKey {
  return value === "technicians" || value === "riggers" || value === "shipwrights" || value === "acTechs";
}

function normalizeDaysOff(days: string[]): string[] {
  return [...new Set(days
    .map((day) => day.trim().slice(0, 3))
    .filter(Boolean)
    .map((day) => day.charAt(0).toUpperCase() + day.slice(1).toLowerCase()))];
}
