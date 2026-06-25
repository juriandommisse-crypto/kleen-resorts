"use client";

import type { WeeklyInsight } from "@/lib/types";

/** Splits bullet-tekst op 'geciteerde ad-namen' en rendert matches als anchor. */
function BulletText({
  text,
  adNameToId,
}: {
  text: string;
  adNameToId: Record<string, string>;
}) {
  const parts = text.split(/('(?:[^']+?)')/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("'") && part.endsWith("'")) {
          const name = part.slice(1, -1);
          const id = adNameToId[name];
          if (id) {
            return (
              <a
                key={i}
                href={`#ad-${id}`}
                className="underline decoration-white/50 hover:decoration-white"
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(`ad-${id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("ring-2", "ring-white");
                    setTimeout(() => el.classList.remove("ring-2", "ring-white"), 2000);
                  }
                }}
              >
                {name}
              </a>
            );
          }
          return <span key={i}>{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function InsightPanel({
  insight,
  adNameToId = {},
}: {
  insight: WeeklyInsight | null;
  adNameToId?: Record<string, string>;
}) {
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
                <span>
                  <BulletText text={b} adNameToId={adNameToId} />
                </span>
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
