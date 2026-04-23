import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

const allowedOrigins = [
  "http://localhost:4321",
  "http://localhost:4322",
  "http://localhost:3000",
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] || "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
};

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    const { searchParams } = new URL(req.url);
    const public_key = searchParams.get("public_key");

    if (!public_key) {
      return NextResponse.json(
        { error: "Clé publique requise" },
        { status: 400, headers: getCorsHeaders(origin) },
      );
    }

    const { data: merchant, error } = await supabaseAdmin
      .from("merchants")
      .select("id, public_key, currency, request_mode, sending_mode, is_active")
      .eq("public_key", public_key)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: getCorsHeaders(origin) },
      );
    }

    if (!merchant) {
      return NextResponse.json(
        { valid: false, error: "Clé publique invalide ou inactive" },
        { status: 200, headers: getCorsHeaders(origin) },
      );
    }
    return NextResponse.json(
      {
        valid: true,
        merchant: {
          id: merchant.id,
          public_key: merchant.public_key,
          currency: merchant.currency,
          request_mode: merchant.request_mode,
          sending_mode: merchant.sending_mode,
        },
      },
      { status: 200, headers: getCorsHeaders(origin) },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500, headers: getCorsHeaders(origin) },
    );
  }
}
