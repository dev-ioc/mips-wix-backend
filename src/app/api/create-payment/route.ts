import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse body ──
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Body JSON invalide ou vide" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { wix_site_id, amount, title, redirect_url } = body;

    console.log("📥 Requête reçue:", { wix_site_id, amount, title });

    if (!wix_site_id || !amount) {
      return NextResponse.json(
        { error: "wix_site_id et amount sont requis" },
        { status: 400, headers: corsHeaders },
      );
    }

    // ── 2. Récupérer marchand Supabase ──
    const { data: merchant, error: merchantError } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("wix_site_id", wix_site_id)
      .eq("is_active", true)
      .single();

    console.log(merchant);

    if (merchantError || !merchant) {
      return NextResponse.json(
        {
          error: "Marchand non trouvé",
          detail: merchantError?.message,
          code: merchantError?.code,
        },
        { status: 404, headers: corsHeaders },
      );
    }

    const currency = merchant.currency || "MUR";

    // ── 3. Appel MiPS ──
    const id_order = `WIX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const mipsPayload = {
      authentify: {
        id_merchant: merchant.id_merchant,
        id_entity: merchant.id_entity,
        id_operator: merchant.id_operator,
        operator_password: merchant.operator_password,
      },
      request: {
        request_mode: merchant.request_mode || "simple",
        sending_mode: merchant.sending_mode || "link",
        request_title: title || "Paiement Wix",
      },
      initial_payment: {
        id_order,
        currency,
        amount: parseFloat(String(amount)),
      },
      iframe_behavior: {
        custom_redirection_url: redirect_url || "",
      },
    };

    console.log("📤 Payload MiPS:", JSON.stringify(mipsPayload, null, 2));

    // ── rawText déclaré ici pour être accessible partout ──
    let rawText = "";
    let mipsResponse: Response;

    try {
      mipsResponse = await fetch(
        "https://api.mips.mu/api/create_payment_request",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "user-agent": "WixMiPS/1.0",
          },
          body: JSON.stringify(mipsPayload),
        },
      );

      // ── Lu UNE SEULE FOIS ici ──
      rawText = await mipsResponse.text();
      console.log(
        "📨 Réponse MiPS (status",
        mipsResponse.status,
        "):",
        rawText.slice(0, 500),
      );
    } catch (fetchError: any) {
      console.error("❌ Fetch MiPS échoué:", {
        message: fetchError.message,
        code: fetchError.cause?.code,
      });
      return NextResponse.json(
        {
          error: "Impossible de joindre l'API MiPS",
          details: fetchError.message,
        },
        { status: 503, headers: corsHeaders },
      );
    }

    // ── Parser le JSON depuis rawText déjà lu ──
    let mipsData: any;
    try {
      mipsData = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          error: "MiPS a retourné une réponse invalide (non-JSON)",
          status: mipsResponse!.status,
          preview: rawText.slice(0, 200),
          hint: "Vérifiez vos credentials MiPS (id_merchant, id_entity, id_operator, operator_password)",
        },
        { status: 502, headers: corsHeaders },
      );
    }

    console.log("✅ MiPS data:", mipsData);

    if (mipsData.operation_status !== "success") {
      return NextResponse.json(
        {
          error: mipsData.operation_details || "Erreur MiPS",
          mips_response: mipsData,
        },
        { status: 502, headers: corsHeaders },
      );
    }

    // ── 4. Sauvegarder en DB ──
    const { error: dbError } = await supabaseAdmin
      .from("payments")
      .insert({
        merchant_id: merchant.id,
        wix_site_id,
        id_order,
        amount: parseFloat(String(amount)),
        currency,
        status: "pending",
        payment_link: mipsData.payment_link?.url,
        qr_code: mipsData.payment_link?.qr_code,
        request_title: title,
      })
      .select()
      .single();

    if (dbError) console.error("⚠️ DB save error (non-bloquant):", dbError);

    return NextResponse.json(
      {
        success: true,
        payment_id: id_order,
        payment_link: mipsData.payment_link?.url,
        qr_code: mipsData.payment_link?.qr_code,
        currency,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    console.error("❌ Erreur générale:", error);
    return NextResponse.json(
      { error: "Erreur serveur", details: error?.message },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: corsHeaders },
  );
}
