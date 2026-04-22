// backend/app/api/merchant/get-credentials/route.ts
import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// ✅ Configuration CORS - version avec valeurs par défaut
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

type Merchant = {
  id: string;
  wix_site_id: string;
  id_merchant: string;
  id_entity: string;
  id_operator: string;
  currency: string;
  is_active: boolean;
  created_at: string;
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
    // Récupérer le token depuis le header Authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token manquant" },
        { status: 401, headers: getCorsHeaders(origin) },
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Décoder le token pour obtenir l'userId
    let userId: string | null = null;

    try {
      // Essayer de décoder le token JWT
      const base64Payload = token.split(".")[1];
      const payload = JSON.parse(atob(base64Payload));
      userId = payload.id || payload.userId || payload.user_id;
    } catch (e) {
      console.error("Erreur décodage token:", e);
      return NextResponse.json(
        { error: "Token invalide" },
        { status: 401, headers: getCorsHeaders(origin) },
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "userId non trouvé dans le token" },
        { status: 400, headers: getCorsHeaders(origin) },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: getCorsHeaders(origin) },
      );
    }

    if (!data) {
      return NextResponse.json(
        { configured: false, merchant: null },
        { status: 200, headers: getCorsHeaders(origin) },
      );
    }

    return NextResponse.json(
      {
        configured: true,
        merchant: data as Merchant,
      },
      { status: 200, headers: getCorsHeaders(origin) },
    );
  } catch (error: any) {
    console.error("get-credentials error:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500, headers: getCorsHeaders(origin) },
    );
  }
}
