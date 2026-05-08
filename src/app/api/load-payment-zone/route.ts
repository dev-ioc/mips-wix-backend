import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  const isWixOrigin =
    origin &&
    (origin.endsWith(".wix.com") ||
      origin.endsWith(".wixsite.com") ||
      origin.endsWith(".wix-dev-center-test.org") ||
      origin.endsWith(".editorx.com") ||
      origin.endsWith(".wixstudio.com") ||
      origin === "https://mips-payments.dev-mdg.workers.dev");

  return {
    "Access-Control-Allow-Origin": isWixOrigin ? origin : origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Max-Age": "86400",
  };
};

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const {
      public_key,
      amount,
      title,
      currency: currencyOverride,
      sending_mode,
      request_mode,
      redirect_url,
      callback_url,
      customer,
    } = body;

    if (!amount) {
      return NextResponse.json(
        { error: "amount est requis" },
        { status: 400, headers: getCorsHeaders(origin) },
      );
    }
    const { data: merchant, error } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("public_key", public_key)
      .eq("is_active", true)
      .single();

    if (error || !merchant) {
      return NextResponse.json(
        { error: "Marchand non trouvé. Vérifiez votre clé publique." },
        { status: 404, headers: getCorsHeaders(origin) },
      );
    }

    const id_order = `WIX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const basicAuth = Buffer.from(
      `${merchant.auth_basic_username}:${merchant.auth_basic_password}`,
    ).toString("base64");
    const mipsPayload = {
      authentify: {
        id_merchant: merchant.id_merchant,
        id_entity: merchant.id_entity,
        id_operator: merchant.id_operator,
        operator_password: merchant.operator_password,
      },
      request: {
        request_mode: request_mode || merchant.request_mode || "simple",
        sending_mode: "iframe",
        request_title: title || "Paiement",
        options: "warranty",
        client_details: {
          first_name: customer?.first_name || "",
          last_name: customer?.last_name || "",
          client_email: customer?.client_email || "",
          phone_number: customer?.phone_number || "",
        },
      },
      initial_payment: {
        id_order,
        currency: currencyOverride || merchant.currency || "MUR",
        amount: parseFloat(String(amount)),
      },
      iframe_behavior: {
        custom_redirection_url: redirect_url || "",
        imn_callback_url:
          callback_url ||
          `${process.env.NEXT_PUBLIC_APP_URL}/api/payment-callback`,
      },
    };

    console.log(
      "[load-payment-zone] Payload:",
      JSON.stringify(mipsPayload, null, 2),
    );
    const mipsResponse = await fetch(
      "https://api.mips.mu/api/load_payment_zone",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify(mipsPayload),
      },
    );

    const rawText = await mipsResponse.text();
    console.log("[load-payment-zone] Réponse MiPS raw:", rawText.slice(0, 500));

    let mipsData: any;
    try {
      mipsData = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          error: "Réponse invalide de l'API MiPS",
          http_status: mipsResponse.status,
          raw_response: rawText.slice(0, 300),
        },
        { status: 502, headers: getCorsHeaders(origin) },
      );
    }
    if (mipsData.operation_status !== "success") {
      return NextResponse.json(
        {
          error: mipsData.operation_details || "Erreur création paiement",
          mips_response: mipsData,
        },
        { status: 502, headers: getCorsHeaders(origin) },
      );
    }

    try {
      await supabaseAdmin.from("payments").insert({
        public_key: public_key || null,
        id_order,
        amount: parseFloat(String(amount)),
        currency: currencyOverride || merchant.currency || "MUR",
        status: "pending",
        request_title: title || "Paiement",
        created_at: new Date().toISOString(),
      });
    } catch (dbError) {
      console.warn("Erreur sauvegarde DB (non bloquante):", dbError);
    }

    return NextResponse.json(
      {
        success: true,
        payment_id: id_order,
        iframe_html:
          mipsData.iframe_html || mipsData.payment_zone || mipsData.html,
        iframe_url: mipsData.iframe_url || mipsData.payment_url,
      },
      { headers: getCorsHeaders(origin) },
    );
  } catch (error: any) {
    console.error("Erreur serveur:", error);
    return NextResponse.json(
      { error: "Erreur interne", details: error?.message },
      { status: 500, headers: getCorsHeaders(origin) },
    );
  }
}
