import { CrmShell } from "@/components/crm";
import { requireSession } from "@/lib/auth";
import { getOperationsDashboardData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const data = await getOperationsDashboardData();

  return (
    <CrmShell appName={data.appName} reportDateLabel={data.reportDateLabel} session={session}>
      {children}
    </CrmShell>
  );
}
