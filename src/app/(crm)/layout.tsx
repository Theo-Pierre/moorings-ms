import { CrmShell } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const data = getOperationsDashboardData();

  return (
    <CrmShell appName={data.appName} reportDateLabel={data.reportDateLabel} logos={data.logos}>
      {children}
    </CrmShell>
  );
}
