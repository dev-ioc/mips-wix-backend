// backend/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const allowedOrigins = [
  "http://localhost:4321",
  "http://localhost:4322",
  "http://localhost:3000",
  "https://b26f-102-18-5-16.ngrok-free.app",
];

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Vérifier si l'origine est autorisée
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);
  const allowedOrigin = isAllowedOrigin ? origin : allowedOrigins[0];

  // Gérer les preflight requests OPTIONS
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Réponse normale avec headers CORS
  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept",
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
