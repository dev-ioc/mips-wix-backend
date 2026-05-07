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
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Body JSON invalide ou vide" },
        { status: 400, headers: getCorsHeaders(origin) },
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
        { status: 400, headers: getCorsHeaders(origin) },
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
          { status: 404, headers: getCorsHeaders(origin) },
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
        { status: 400, headers: getCorsHeaders(origin) },
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
        options: "warranty",
        client_details: {
          first_name: "KARIJA",
          last_name: "Andriatsilefilaza",
          client_email: "dev_mdg@caspeo.fr",
          phone_number: "0346570207",
        },
        client_other_data: [
          {
            other_data_short_id: "color_of_eyes",
            other_data_value: "brown",
          },
        ],
        order_other_data: [
          {
            other_data_short_id: "color_of_car",
            other_data_value: "green",
          },
        ],
        max_amount_total: 999,
        max_amount_per_claim: 0,
        max_frequency: 0,
        max_date: "2026-08-24",
        deposit_amount: "150.25",
        balance_pattern: [
          {
            balance_number: 5,
            balance_mode: "auto",
            condition: '"Upon request" or "2026-05-25"',
          },
        ],
        membership: {
          interval: 1,
          frequency: "monthly",
          start_date: "2026-05-18",
          end_date: "2026-05-18",
          day_to_process: 5,
          membership_amount: 0,
        },
        client_account_number: "string",
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
    const authBasicUsername = "test_wix_merchant_406971";
    const authBasicPassword = "73a8e2f4bf87a7f3f16c";
    const basicAuth = Buffer.from(
      `${authBasicUsername}:${authBasicPassword}`,
    ).toString("base64");

    console.log(
      "[create-payment] Basic Auth string:",
      `${authBasicUsername}:${authBasicPassword}`,
    );
    console.log("[create-payment] Basic Auth header:", `Basic ${basicAuth}`);
    try {
      mipsResponse = await fetch(
        "https://api.mips.mu/api/create_payment_request",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Basic ${basicAuth}`,
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.78 Safari/537.36",
          },
          body: JSON.stringify(mipsPayload),
        },
      );
      rawText = await mipsResponse.text();
      console.log("[create-payment] Réponse MiPS raw:", rawText.slice(0, 300));
    } catch (error: any) {
      return NextResponse.json(
        { error: "Impossible de contacter l'API MiPS", details: error.message },
        { status: 503, headers: getCorsHeaders(origin) },
      );
    }

    let mipsData: any;
    try {
      mipsData = JSON.parse(rawText);
    } catch {
      console.log("[create-payment] Status MiPS:", mipsResponse.status);
      console.log("[create-payment] Raw MiPS:", rawText.slice(0, 500));
      return NextResponse.json(
        {
          error: "Réponse invalide de l'API MiPS (non-JSON)",
          http_status: mipsResponse.status,
          raw_response: rawText.slice(0, 300),
        },
        { status: 502, headers: getCorsHeaders(origin) },
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
        { status: 502, headers: getCorsHeaders(origin) },
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
      { headers: getCorsHeaders(origin) },
    );
  } catch (error: any) {
    console.error("Erreur serveur interne:", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur", details: error?.message },
      { status: 500, headers: getCorsHeaders(origin) },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST instead." },
    { status: 405, headers: getCorsHeaders(origin) },
  );
}
