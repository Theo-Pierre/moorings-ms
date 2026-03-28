import { CrmShell } from "@/components/crm";
import { getOperationsDashboardData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const data = await getOperationsDashboardData();

  return (
    <CrmShell appName={data.appName} reportDateLabel={data.reportDateLabel}>
      {children}
    </CrmShell>
  );
}
