import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Gestion de la requête OPTIONS (preflight)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Gestion de la requête POST
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wix_site_id, amount, title, redirect_url, currency, items } = body;

    // Validation
    if (!wix_site_id || !amount) {
      return NextResponse.json(
        { error: "wix_site_id et amount sont requis" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Récupérer les credentials du marchand depuis Supabase
    const { data: merchant, error: merchantError } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("wix_site_id", wix_site_id)
      .eq("is_active", true)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json(
        { error: "Marchand non trouvé ou credentials non configurés" },
        { status: 404, headers: corsHeaders },
      );
    }

    // Générer un ID unique
    const id_order = `WIX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    // Appel à l'API MiPS
    const mipsResponse = await fetch(
      "https://api.mips.mu/api/create_payment_request",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          authentify: {
            id_merchant: merchant.id_merchant,
            id_entity: merchant.id_entity,
            id_operator: merchant.id_operator,
            operator_password: merchant.operator_password,
          },
          request: {
            request_mode: "simple",
            sending_mode: "link",
            request_title: title || "Paiement Wix",
          },
          initial_payment: {
            id_order: id_order,
            currency: currency || merchant.currency || "MUR",
            amount: parseFloat(amount as string),
          },
          iframe_behavior: {
            custom_redirection_url: redirect_url || "",
          },
        }),
      },
    );

    const mipsData = await mipsResponse.json();

    if (mipsData.operation_status !== "success") {
      return NextResponse.json(
        {
          error:
            mipsData.operation_details ||
            "Erreur lors de la création du paiement MiPS",
        },
        { status: 502, headers: corsHeaders },
      );
    }

    // Sauvegarde en base de données
    const { data: payment, error: dbError } = await supabaseAdmin
      .from("payments")
      .insert({
        merchant_id: merchant.id,
        wix_site_id,
        id_order,
        amount: parseFloat(amount as string),
        currency: currency || merchant.currency || "MUR",
        status: "pending",
        payment_link: mipsData.payment_link?.url,
        qr_code: mipsData.payment_link?.qr_code,
        request_title: title,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // On continue même si la sauvegarde échoue
    }

    return NextResponse.json(
      {
        success: true,
        payment_id: id_order,
        payment_link: mipsData.payment_link?.url,
        qr_code: mipsData.payment_link?.qr_code,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    console.error("create-payment error:", error);
    return NextResponse.json(
      {
        error: "Erreur serveur",
        details: error?.message || error,
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

// Pour toute autre méthode HTTP
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: corsHeaders },
  );
}
