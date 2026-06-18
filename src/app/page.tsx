import { getDashboardData } from "@/data";
import { Dashboard } from "@/components/Dashboard";

// Cache de pagina 10 minuten (ISR): de sheets worden hooguit eens per 10 min
// gelezen i.p.v. bij elke paginalading. Voorkomt het Google Sheets API-quotum.
// Data ververst dagelijks (Apps Script + cron), dus 10 min is ruim vers genoeg.
export const revalidate = 600;

export default async function Page() {
  const data = await getDashboardData();
  return <Dashboard data={data} />;
}
