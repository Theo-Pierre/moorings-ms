import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { invalidateOperationsDashboardCache } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "super-admin") {
    return NextResponse.json({ error: "Only Super Admin can refresh scheduling." }, { status: 403 });
  }

  invalidateOperationsDashboardCache();
  return NextResponse.json({ ok: true });
}
