import { WorkersPage } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export default async function TechniciansRoute() {
  const data = await getOperationsDashboardData();

  return (
    <WorkersPage
      title="Technician Quality Profiles"
      subtitle="Technician workload, completion quality, and day-off driven availability for current and upcoming execution."
      workers={data.workerReports.technicians}
    />
  );
}
