import { ReportsPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default function ReportsRoute() {
  const data = getOperationsDashboardData();
  return <ReportsPage data={data} />;
}
