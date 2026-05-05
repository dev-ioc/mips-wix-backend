import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Body JSON invalide ou vide" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const {
      public_key,
      id_merchant,
      id_entity,
      operator_id,
      operator_password,
      currency: currencyOverride,
      sending_mode,
      request_mode,
      amount,
      title,
      redirect_url,
    } = body;

    if (!amount) {
      return NextResponse.json(
        { error: "amount est requis" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    let resolvedIdMerchant: string;
    let resolvedIdEntity: string;
    let resolvedIdOperator: string;
    let resolvedOperatorPassword: string;
    let resolvedCurrency: string;
    let resolvedSendingMode: string;
    let resolvedRequestMode: string;

    if (id_merchant && id_entity && operator_id && operator_password) {
      resolvedIdMerchant = id_merchant;
      resolvedIdEntity = id_entity;
      resolvedIdOperator = operator_id;
      resolvedOperatorPassword = operator_password;
      resolvedCurrency = currencyOverride || "MUR";
      resolvedSendingMode = sending_mode || "link";
      resolvedRequestMode = request_mode || "simple";
    } else if (public_key) {
      const { data: merchant, error } = await supabaseAdmin
        .from("merchants")
        .select("*")
        .eq("public_key", public_key)
        .eq("is_active", true)
        .single();

      if (error || !merchant) {
        return NextResponse.json(
          { error: "Marchand non trouvé. Vérifiez votre clé publique." },
          { status: 404, headers: CORS_HEADERS },
        );
      }

      resolvedIdMerchant = merchant.id_merchant;
      resolvedIdEntity = merchant.id_entity;
      resolvedIdOperator = merchant.operator_id;
      resolvedOperatorPassword = merchant.operator_password;
      resolvedCurrency = currencyOverride || merchant.currency || "MUR";
      resolvedSendingMode = sending_mode || merchant.sending_mode || "link";
      resolvedRequestMode = request_mode || merchant.request_mode || "simple";
    } else {
      return NextResponse.json(
        {
          error:
            "Credentials manquants (id_merchant + id_entity + operator_id + operator_password) ou public_key requis",
        },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const id_order = `WIX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const mipsPayload = {
      authentify: {
        id_merchant: resolvedIdMerchant,
        id_entity: resolvedIdEntity,
        id_operator: resolvedIdOperator,
        operator_password: resolvedOperatorPassword,
      },
      request: {
        request_mode: resolvedRequestMode,
        sending_mode: resolvedSendingMode,
        request_title: title || "Paiement Wix",
      },
      initial_payment: {
        id_order,
        currency: resolvedCurrency,
        amount: parseFloat(String(amount)),
      },
      iframe_behavior: {
        custom_redirection_url: redirect_url || "",
      },
    };

    console.log(
      "[create-payment] Payload MiPS:",
      JSON.stringify(mipsPayload, null, 2),
    );
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
          },
          body: JSON.stringify(mipsPayload),
        },
      );
      rawText = await mipsResponse.text();
      console.log("[create-payment] Réponse MiPS raw:", rawText.slice(0, 300));
    } catch (error: any) {
      return NextResponse.json(
        { error: "Impossible de contacter l'API MiPS", details: error.message },
        { status: 503, headers: CORS_HEADERS },
      );
    }

    let mipsData: any;
    try {
      mipsData = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          error: "Réponse invalide de l'API MiPS (non-JSON)",
          raw_response: rawText.slice(0, 300),
        },
        { status: 502, headers: CORS_HEADERS },
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
        { status: 502, headers: CORS_HEADERS },
      );
    }

    try {
      await supabaseAdmin.from("payments").insert({
        public_key: public_key || null,
        id_order,
        amount: parseFloat(String(amount)),
        currency: resolvedCurrency,
        status: "pending",
        payment_link: mipsData.payment_link?.url,
        qr_code: mipsData.payment_link?.qr_code,
        request_title: title || "Paiement Wix",
        created_at: new Date().toISOString(),
      });
    } catch (dbError) {
      console.warn("Erreur sauvegarde DB (non bloquante):", dbError);
    }

    return NextResponse.json(
      {
        success: true,
        payment_id: id_order,
        payment_link: mipsData.payment_link?.url,
        qr_code: mipsData.payment_link?.qr_code,
        currency: resolvedCurrency,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error: any) {
    console.error("Erreur serveur interne:", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur", details: error?.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST instead." },
    { status: 405, headers: CORS_HEADERS },
  );
}
