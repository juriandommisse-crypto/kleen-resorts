import type { WeeklyInsight } from "@/lib/types";

export function InsightPanel({ insight }: { insight: WeeklyInsight | null }) {
  return (
    <div className="rounded-2xl bg-brand p-5 text-white shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/70">
        <span>✨ Slimme samenvatting</span>
      </div>
      {insight ? (
        <>
          <h2 className="text-lg font-semibold">{insight.headline}</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/90">
            {insight.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 text-white/50">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-white/90">
          Voeg een OpenAI API-key toe om hier wekelijks een automatische duiding
          van de cijfers te laten verschijnen.
        </p>
      )}
    </div>
  );
}
