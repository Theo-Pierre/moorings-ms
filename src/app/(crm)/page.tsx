import { OverviewPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const data = await getOperationsDashboardData();
  return <OverviewPage data={data} />;
}
