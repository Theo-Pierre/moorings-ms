import { SchedulePage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ScheduleRoute() {
  const data = await getOperationsDashboardData();
  return <SchedulePage data={data} />;
}
