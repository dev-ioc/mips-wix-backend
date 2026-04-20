// backend/app/api/merchant/save-credentials/route.ts
import { supabaseAdmin } from "@/app/lib/supabase";
import { authenticate } from "@/app/utils/auth";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:4321",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
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
    console.log(user?.user_id);
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
        { status: 400, headers: corsHeaders },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("merchants")
      .upsert(
        {
          wix_site_id,
          wix_instance_id: wix_instance_id || null,
          id_merchant,
          id_entity,
          id_operator,
          operator_password,
          currency: currency || "MUR",
          is_active: true,
          updated_at: new Date().toISOString(),
          user_id: user?.user_id,
          request_mode: request_mode || "simple",
          sending_mode: sending_mode || "link",
        },
        {
          onConflict: "wix_site_id",
          ignoreDuplicates: false,
        },
      )
      .select()
      .single();

    if (error || !data) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: error?.message || "Échec de l'insertion" },
        { status: 500, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      {
        success: true,
        merchant_id: data.id,
        message: "Credentials sauvegardés avec succès",
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (error: any) {
    console.error("save-credentials error:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500, headers: corsHeaders },
    );
  }
}
