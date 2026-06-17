// Valuta-normalisatie.
//
// De Ad Spend-sheet mengt notaties: "€11.251,22" (Nederlands) en "$41,16".
// Alle bedragen in het dashboard zijn in EUR. Voor live-data van de Meta API
// komt spend al als getal binnen; voor sheet-data parsen we de strings hier.

/**
 * Parse een bedrag-string uit de sheet naar een getal in EUR.
 * Ondersteunt "€11.251,22", "$41,16", "€ 0", "1.234,56", "-".
 *
 * LET OP: $-waarden worden NIET automatisch omgerekend — in de sheet gaat het
 * om dezelfde euro-budgetten met een afwijkend valutateken vanuit de connector.
 * Zet WANTS_USD_CONVERSION aan zodra blijkt dat het echt USD is.
 */
const WANTS_USD_CONVERSION = false;
const USD_TO_EUR = 0.92; // placeholder; haal live op indien ooit nodig

export function parseSheetAmount(raw: string | number | undefined | null): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;

  const isUsd = raw.includes("$");
  // Verwijder valutatekens en spaties, dan NL-notatie -> punt-decimaal.
  const cleaned = raw
    .replace(/[€$\s]/g, "")
    .replace(/\./g, "") // duizendtallen-punt weg
    .replace(/,/g, "."); // decimaalkomma -> punt

  const value = parseFloat(cleaned);
  if (Number.isNaN(value)) return 0;

  if (isUsd && WANTS_USD_CONVERSION) return value * USD_TO_EUR;
  return value;
}
