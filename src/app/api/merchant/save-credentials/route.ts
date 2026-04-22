// backend/app/api/merchant/save-credentials/route.ts
import { supabaseAdmin } from "@/app/lib/supabase";
import { authenticate } from "@/app/utils/auth";
import { NextRequest, NextResponse } from "next/server";

// ✅ Configuration CORS dynamique
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

type RequestBody = {
  wix_site_id: string;
  wix_instance_id?: string;
  id_merchant: string;
  id_entity: string;
  id_operator: string;
  operator_password: string;
  currency?: string;
  request_mode?: string;
  sending_mode?: string;
};

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    const user = authenticate(req);
    const body = await req.json();
    const {
      wix_site_id,
      wix_instance_id,
      id_merchant,
      id_entity,
      id_operator,
      operator_password,
      currency,
      request_mode,
      sending_mode,
    } = body as RequestBody;

    console.log("📝 User ID:", user?.user_id);
    console.log("🏪 Wix Site ID:", wix_site_id);

    // Validation stricte
    if (
      !wix_site_id ||
      !id_merchant ||
      !id_entity ||
      !id_operator ||
      !operator_password
    ) {
      return NextResponse.json(
        { error: "Tous les champs credentials sont requis" },
        { status: 400, headers: getCorsHeaders(origin) },
      );
    }

    // Vérifier si les credentials existent déjà
    const { data: existingMerchant, error: findError } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("wix_site_id", wix_site_id)
      .maybeSingle();

    if (findError && findError.code !== "PGRST116") {
      console.error("Erreur recherche existant:", findError);
    }

    let result;

    if (existingMerchant) {
      // Mise à jour des credentials existants
      console.log(
        "📦 Mise à jour des credentials existants pour:",
        wix_site_id,
      );

      const updateData = {
        id_merchant,
        id_entity,
        id_operator,
        operator_password,
        updated_at: new Date().toISOString(),
        // Mettre à jour les champs optionnels s'ils sont fournis
        ...(currency && { currency }),
        ...(request_mode && { request_mode }),
        ...(sending_mode && { sending_mode }),
      };

      result = await supabaseAdmin
        .from("merchants")
        .update(updateData)
        .eq("wix_site_id", wix_site_id)
        .select()
        .single();

      console.log("✅ Credentials mis à jour");
    } else {
      // Création de nouveaux credentials
      console.log("🆕 Création de nouveaux credentials pour:", wix_site_id);

      result = await supabaseAdmin
        .from("merchants")
        .insert({
          wix_site_id,
          wix_instance_id: wix_instance_id || null,
          id_merchant,
          id_entity,
          id_operator,
          operator_password,
          currency: currency || "MUR",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: user?.user_id,
          request_mode: request_mode || "simple",
          sending_mode: sending_mode || "link",
        })
        .select()
        .single();

      console.log("✅ Nouveaux credentials créés");
    }

    if (result.error || !result.data) {
      console.error("Supabase error:", result.error);
      return NextResponse.json(
        { error: result.error?.message || "Échec de la sauvegarde" },
        { status: 500, headers: getCorsHeaders(origin) },
      );
    }

    return NextResponse.json(
      {
        success: true,
        merchant_id: result.data.id,
        message: existingMerchant
          ? "Credentials mis à jour avec succès"
          : "Credentials sauvegardés avec succès",
        is_update: !!existingMerchant,
      },
      { status: 200, headers: getCorsHeaders(origin) },
    );
  } catch (error: any) {
    console.error("save-credentials error:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500, headers: getCorsHeaders(origin) },
    );
  }
}
