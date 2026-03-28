import { OverviewPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default async function HomePage() {
  const data = await getOperationsDashboardData();
  return <OverviewPage data={data} />;
}
