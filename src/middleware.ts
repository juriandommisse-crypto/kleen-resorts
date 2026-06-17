import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optionele beveiliging zonder code te wijzigen:
//  - DASHBOARD_PASSWORD leeg  -> open (geheime URL, huidige keuze).
//  - DASHBOARD_PASSWORD gezet -> simpele HTTP Basic Auth (gebruikersnaam vrij).
//
// Zo kun je later met één omgevingsvariabele een wachtwoord aanzetten.

export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const pass = decoded.split(":").slice(1).join(":");
    if (pass === password) return NextResponse.next();
  }

  return new NextResponse("Authenticatie vereist", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Kleen Resorts Dashboard"' },
  });
}

export const config = {
  // Beveilig de pagina's, niet de statische assets of de cron-endpoint.
  matcher: ["/((?!api/refresh|_next/static|_next/image|favicon.ico).*)"],
};
