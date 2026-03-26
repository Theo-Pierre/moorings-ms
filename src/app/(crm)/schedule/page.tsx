import { SchedulePage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default function ScheduleRoute() {
  const data = getOperationsDashboardData();
  return <SchedulePage data={data} />;
}
