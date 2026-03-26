import { OverviewPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default function HomePage() {
  const data = getOperationsDashboardData();
  return <OverviewPage data={data} />;
}
