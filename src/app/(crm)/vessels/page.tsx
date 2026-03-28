import { VesselsPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default async function VesselsRoute() {
  const data = await getOperationsDashboardData();
  return <VesselsPage vessels={data.vesselReports} reportDateLabel={data.reportDateLabel} />;
}
