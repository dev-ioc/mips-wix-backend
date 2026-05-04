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

    const {
      public_key,
      id_merchant,
      id_entity,
      id_operator,
      operator_password,
      currency: currencyOverride,
      sending_mode,
      request_mode,
      amount,
      title,
      redirect_url,
    } = body;

    if (!amount) {
      return NextResponse.json({ error: "amount est requis" }, { status: 400 });
    }

    let merchantData: any;

    if (id_merchant && id_entity && id_operator && operator_password) {
      merchantData = {
        id_merchant,
        id_entity,
        id_operator,
        operator_password,
        currency: currencyOverride || "MUR",
        sending_mode: sending_mode || "link",
        request_mode: request_mode || "simple",
        id: null,
        public_key: null,
      };
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
          { status: 404 },
        );
      }
      merchantData = merchant;
    } else {
      return NextResponse.json(
        {
          error:
            "public_key ou credentials directs (id_merchant, id_entity, id_operator, operator_password) sont requis",
        },
        { status: 400 },
      );
    }

    const currency = merchantData.currency || "MUR";
    const id_order = `WIX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const mipsPayload = {
      authentify: {
        id_merchant: merchantData.id_merchant,
        id_entity: merchantData.id_entity,
        id_operator: merchantData.id_operator,
        operator_password: merchantData.operator_password,
      },
      request: {
        request_mode: merchantData.request_mode || "simple",
        sending_mode: merchantData.sending_mode || "link",
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
          error: "Réponse invalide de l'API MiPS",
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
        merchant_id: merchantData.id || null,
        public_key: merchantData.public_key || public_key || null,
        id_order,
        amount: parseFloat(String(amount)),
        currency,
        status: "pending",
        payment_link: mipsData.payment_link?.url,
        qr_code: mipsData.payment_link?.qr_code,
        request_title: title || "Paiement Wix",
        created_at: new Date().toISOString(),
      });
    } catch (dbError) {
      console.warn("Erreur sauvegarde DB (non bloquante):", dbError);
    }

    return NextResponse.json({
      success: true,
      payment_id: id_order,
      payment_link: mipsData.payment_link?.url,
      qr_code: mipsData.payment_link?.qr_code,
      currency,
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
