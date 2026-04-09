import { CrmShell } from "@/components/crm";
import { requireSession } from "@/lib/auth";
import { getOperationsDashboardData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const data = await getOperationsDashboardData();
  const workerRecommendations = {
    technicians: data.workerReports.technicians.slice(0, 12).map((worker) => worker.workerLabel),
    riggers: data.workerReports.riggers.slice(0, 12).map((worker) => worker.workerLabel),
    shipwrights: data.workerReports.shipwrights.slice(0, 12).map((worker) => worker.workerLabel),
  };

  return (
    <CrmShell
      appName={data.appName}
      reportDateIso={data.reportDateIso}
      reportDateLabel={data.reportDateLabel}
      planningDateOverride={data.planningDateOverride}
      session={session}
      workerRecommendations={workerRecommendations}
    >
      {children}
    </CrmShell>
  );
}
