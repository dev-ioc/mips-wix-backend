import { supabaseAdmin } from "@/app/lib/supabase";
import { authenticate } from "@/app/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const allowedOrigins = [
  "https://mips-payments.dev-mdg.workers.dev",
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
  auth_basic_username?: string;
  auth_basic_password?: string;
};

const generatePublicKey = (): string => {
  const random = crypto.randomBytes(16).toString("hex");
  return `pk_live_${random}`;
};

const generateUniquePublicKey = async (): Promise<string> => {
  let public_key = generatePublicKey();
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 5;

  while (!isUnique && attempts < maxAttempts) {
    const { data: existing } = await supabaseAdmin
      .from("merchants")
      .select("public_key")
      .eq("public_key", public_key)
      .maybeSingle();

    if (!existing) {
      isUnique = true;
    } else {
      public_key = generatePublicKey();
      attempts++;
    }
  }

  return public_key;
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
      auth_basic_username,
      auth_basic_password,
    } = body as RequestBody;

    if (
      !wix_site_id ||
      !id_merchant ||
      !id_entity ||
      !id_operator ||
      !operator_password ||
      !auth_basic_username ||
      !auth_basic_password
    ) {
      return NextResponse.json(
        { error: "Tous les champs credentials sont requis" },
        { status: 400, headers: getCorsHeaders(origin) },
      );
    }

    const { data: existingMerchant, error: findError } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("id_merchant", id_merchant)
      .maybeSingle();

    if (findError && findError.code !== "PGRST116") {
      console.error("Erreur recherche existant:", findError);
    }

    let result;
    let public_key = existingMerchant?.public_key;

    if (existingMerchant) {
      const updateData = {
        id_merchant,
        id_entity,
        id_operator,
        operator_password,
        auth_basic_username,
        auth_basic_password,
        updated_at: new Date().toISOString(),
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
    } else {
      public_key = await generateUniquePublicKey();

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
          public_key,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: user?.user_id,
          request_mode: request_mode || "simple",
          sending_mode: sending_mode || "link",
          auth_basic_username,
          auth_basic_password,
        })
        .select()
        .single();
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
        public_key: public_key,
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
