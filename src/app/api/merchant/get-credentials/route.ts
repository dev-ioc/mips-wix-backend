// backend/app/api/merchant/get-credentials/route.ts
import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:4321",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const wix_site_id = searchParams.get("wix_site_id");

    if (!wix_site_id) {
      return NextResponse.json(
        { error: "wix_site_id requis" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("merchants")
      .select(
        "id, wix_site_id, id_merchant, id_entity, id_operator, currency, is_active, created_at",
      )
      .eq("wix_site_id", wix_site_id)
      .maybeSingle();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!data) {
      return NextResponse.json(
        { configured: false, merchant: null },
        { status: 200, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      {
        configured: true,
        merchant: data as Merchant,
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (error: any) {
    console.error("get-credentials error:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500, headers: corsHeaders },
    );
  }
}
