import { getDashboardData } from "@/data";
import { Dashboard } from "@/components/Dashboard";

// Altijd vers renderen (data komt straks van externe bronnen).
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getDashboardData();
  return <Dashboard data={data} />;
}
