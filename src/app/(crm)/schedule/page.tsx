import { SchedulePage } from "@/components/crm";
import { requireSession } from "@/lib/auth";
import { getOperationsDashboardData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ScheduleRoute() {
  const session = await requireSession();
  const data = await getOperationsDashboardData();
  return (
    <SchedulePage
      data={data}
      viewer={{
        name: session.name,
        email: session.email,
        role: session.role,
      }}
    />
  );
}
