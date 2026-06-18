// Koppeltabel voor projectnamen.
//
// In de sheets worden parken op meerdere manieren benoemd:
//  - Afkortingen in de Ad Spend-funneltabellen: "FM", "HTH", "GW", "OYS", ...
//  - Volledige namen in de Leads-sheet: "Fryske Mar - Resort Balk", ...
//  - Account-namen in Meta/Google: "Fryske Mar (Kleen) - Verkoop", ...
//
// Deze module normaliseert alles naar één canonieke projectnaam zodat leads en
// spend op elkaar matchen. Breid de aliassen uit zodra we live-data koppelen.

/** Canonieke projectnamen (zoals we ze in het dashboard tonen). */
export const CANONICAL_PROJECTS = [
  "Algemeen",
  "Fryske Mar - Resort Balk",
  "Greenerwold",
  "Huis ter Huynen",
  "Recreatiepark de Stelleplas - Heinkenszand",
  "Recreatiepark Hellendoorn",
  "Recreatiepark Landgoed De Huynen",
  "Resort Oysterduinen - Yerseke",
  "Vinkeveense Plassen",
  "Vosseweide - Resort Buitengewoon Zeeland",
  "WestonBay - Resort Amsterdam",
  "Wiedeweer",
] as const;

export type CanonicalProject = (typeof CANONICAL_PROJECTS)[number];

/**
 * Parken die momenteel actief in de verkoop zijn. Alleen deze worden
 * meegenomen in de slimme samenvatting. Pas deze lijst aan als het verkoop-
 * aanbod wijzigt.
 */
export const ACTIVE_SALES_PROJECTS: CanonicalProject[] = [
  "Greenerwold",
  "Wiedeweer",
  "Fryske Mar - Resort Balk",
];

// Aliassen (lowercase, substring-match) -> canonieke naam.
const ALIASES: Array<[needle: string, canonical: CanonicalProject]> = [
  ["fryske mar", "Fryske Mar - Resort Balk"],
  ["fm", "Fryske Mar - Resort Balk"],
  ["greenerwold", "Greenerwold"],
  ["gw", "Greenerwold"],
  ["huis ter huynen", "Huis ter Huynen"],
  ["hth", "Huis ter Huynen"],
  ["landgoed de huynen", "Recreatiepark Landgoed De Huynen"],
  ["stelleplas", "Recreatiepark de Stelleplas - Heinkenszand"],
  ["hellendoorn", "Recreatiepark Hellendoorn"],
  ["oysterduinen", "Resort Oysterduinen - Yerseke"],
  ["oys", "Resort Oysterduinen - Yerseke"],
  ["vinkeveen", "Vinkeveense Plassen"],
  ["vosseweide", "Vosseweide - Resort Buitengewoon Zeeland"],
  ["buitengewoon zeeland", "Vosseweide - Resort Buitengewoon Zeeland"],
  ["westonbay", "WestonBay - Resort Amsterdam"],
  ["wiedeweer", "Wiedeweer"],
  ["wdw", "Wiedeweer"],
  ["kraggenburg", "Wiedeweer"],
  ["flevoland", "Wiedeweer"],
  ["zuyderzee", "Wiedeweer"],
  ["zuiderzee", "Wiedeweer"],
  ["algemeen", "Algemeen"],
  ["kleen algemeen", "Algemeen"],
];

/**
 * Probeer een aanduiding te matchen op een canoniek project.
 * Geeft `null` terug als er geen match is (i.t.t. normalizeProject).
 */
export function matchProject(raw: string | undefined | null): CanonicalProject | null {
  if (!raw) return null;
  const hay = raw.toLowerCase().trim();

  const exact = CANONICAL_PROJECTS.find((p) => p.toLowerCase() === hay);
  if (exact) return exact;

  // Langere aliassen eerst, zodat specifieke namen voorrang krijgen boven afkortingen.
  for (const [needle, canonical] of [...ALIASES].sort((a, b) => b[0].length - a[0].length)) {
    if (hay.includes(needle)) return canonical;
  }
  return null;
}

/**
 * Zet een willekeurige park-/accountaanduiding om naar de canonieke naam.
 * Geeft "Algemeen" terug als er geen match is (en logt dat in dev).
 */
export function normalizeProject(raw: string | undefined | null): CanonicalProject {
  const matched = matchProject(raw);
  if (matched) return matched;

  if (raw && process.env.NODE_ENV !== "production") {
    console.warn(`[parks] Geen match voor projectnaam: "${raw}" -> "Algemeen"`);
  }
  return "Algemeen";
}
