import { SchedulePage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default async function ScheduleRoute() {
  const data = await getOperationsDashboardData();
  return <SchedulePage data={data} />;
}
