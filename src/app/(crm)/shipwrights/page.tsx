import { WorkersPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default async function ShipwrightsRoute() {
  const data = await getOperationsDashboardData();

  return (
    <WorkersPage
      title="Shipwright Quality Profiles"
      subtitle="Individual shipwright reporting with workload, completion history, and on-time performance."
      workers={data.workerReports.shipwrights}
    />
  );
}
