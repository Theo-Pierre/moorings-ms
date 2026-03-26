import { WorkersPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default function RiggersRoute() {
  const data = getOperationsDashboardData();

  return (
    <WorkersPage
      title="Rigger Quality Profiles"
      subtitle="Individual rigger reporting with workload, completion history, and on-time performance."
      workers={data.workerReports.riggers}
    />
  );
}
