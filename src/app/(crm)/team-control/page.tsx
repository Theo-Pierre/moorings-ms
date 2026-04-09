import { redirect } from "next/navigation";

import { TeamControlPanel } from "@/components/crm";
import { requireSession } from "@/lib/auth";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default async function TeamControlRoute() {
  const session = await requireSession();
  if (session.role !== "super-admin") {
    redirect("/");
  }

  const data = await getOperationsDashboardData();
  return <TeamControlPanel teamRoster={data.teamRoster} canManage />;
}
