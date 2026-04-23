import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Body JSON invalide ou vide" },
        { status: 400 },
      );
    }

    const { public_key, amount, title, redirect_url } = body;
    if (!public_key || !amount) {
      return NextResponse.json(
        { error: "public_key et amount sont requis" },
        { status: 400 },
      );
    }
    const { data: merchant, error: merchantError } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("public_key", public_key)
      .eq("is_active", true)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json(
        { error: "Marchand non trouvé. Vérifiez votre clé publique." },
        { status: 404 },
      );
    }

    const currency = merchant.currency || "MUR";
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
            "User-Agent": "WixMiPS/1.0",
          },
          body: JSON.stringify(mipsPayload),
        },
      );

      rawText = await mipsResponse.text();
    } catch (error: any) {
      return NextResponse.json(
        { error: "Impossible de contacter l'API MiPS", details: error.message },
        { status: 503 },
      );
    }

    let mipsData: any;
    try {
      mipsData = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          error: "Réponse invalide des credentials MiPS",
          raw_response: rawText.slice(0, 200),
        },
        { status: 502 },
      );
    }

    if (mipsData.operation_status !== "success") {
      return NextResponse.json(
        {
          error:
            mipsData.operation_details ||
            "Erreur lors de la création du paiement",
          mips_response: mipsData,
        },
        { status: 502 },
      );
    }
    try {
      await supabaseAdmin.from("payments").insert({
        merchant_id: merchant.id,
        public_key: public_key,
        id_order: id_order,
        amount: parseFloat(String(amount)),
        currency: currency,
        status: "pending",
        payment_link: mipsData.payment_link?.url,
        qr_code: mipsData.payment_link?.qr_code,
        request_title: title || "Paiement Wix",
        created_at: new Date().toISOString(),
      });
    } catch (dbError) {
      console.warn(
        "Erreur lors de la sauvegarde en DB (non bloquante):",
        dbError,
      );
    }
    return NextResponse.json({
      success: true,
      payment_id: id_order,
      payment_link: mipsData.payment_link?.url,
      qr_code: mipsData.payment_link?.qr_code,
      currency: currency,
    });
  } catch (error: any) {
    console.error("Erreur serveur interne:", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur", details: error?.message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST instead." },
    { status: 405 },
  );
}
