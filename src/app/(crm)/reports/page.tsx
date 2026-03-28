import { ReportsPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default async function ReportsRoute() {
  const data = await getOperationsDashboardData();
  return <ReportsPage data={data} />;
}
