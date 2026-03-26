import { VesselsPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default function VesselsRoute() {
  const data = getOperationsDashboardData();
  return <VesselsPage vessels={data.vesselReports} reportDateLabel={data.reportDateLabel} />;
}
