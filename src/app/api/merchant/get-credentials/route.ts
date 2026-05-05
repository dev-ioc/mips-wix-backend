import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// const allowedOrigins = [
//   "https://mips-payments.dev-mdg.workers.dev",
//   process.env.NEXT_PUBLIC_APP_URL,
// ].filter(Boolean) as string[];

// const getCorsHeaders = (origin: string | null): Record<string, string> => {
//   const isAllowed =
//     !origin || origin === "null" || allowedOrigins.includes(origin);

//   return {
//     "Access-Control-Allow-Origin": isAllowed
//       ? origin || "*"
//       : allowedOrigins[0],
//     "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
//     "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
//     "Access-Control-Max-Age": "86400",
//   };
// };
const getCorsHeaders = (origin: string | null): Record<string, string> => {
  // Accepter toutes les origines Wix et votre dashboard
  const isWixOrigin =
    origin &&
    (origin.endsWith(".wix.com") ||
      origin.endsWith(".wixsite.com") ||
      origin.endsWith(".wix-dev-center-test.org") ||
      origin.endsWith(".editorx.com") ||
      origin === "https://mips-payments.dev-mdg.workers.dev");

  return {
    "Access-Control-Allow-Origin": isWixOrigin ? origin : origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
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
  const publicKey = req.nextUrl.searchParams.get("public_key");

  try {
    if (publicKey) {
      const { data, error } = await supabaseAdmin
        .from("merchants")
        .select("*")
        .eq("public_key", publicKey)
        .eq("is_active", true)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Merchant non trouvé ou inactif" },
          { status: 401, headers: getCorsHeaders(origin) },
        );
      }
      return NextResponse.json(
        {
          configured: true,
          merchant: {
            currency: data.currency,
            sending_mode: data.sending_mode,
            request_mode: data.request_mode,
            id_merchant: data.id_merchant,
            id_entity: data.id_entity,
            operator_id: data.id_operator,
            operator_password: data.operator_password,
          },
        },
        { status: 200, headers: getCorsHeaders(origin) },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token manquant" },
        { status: 401, headers: getCorsHeaders(origin) },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;

    try {
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
      { configured: true, merchant: data as Merchant },
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
