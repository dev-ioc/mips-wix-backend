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
      currency: currencyOverride,
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
        { error: "Marchand non trouv\u00e9." },
        { status: 404, headers: getCorsHeaders(origin) },
      );
    }
    const id_order = `WIX${Date.now().toString().slice(-10)}${uuidv4().slice(0, 6).toUpperCase()}`;

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
      order: {
        id_order,
        currency: currencyOverride || merchant.currency || "MUR",
        amount: parseFloat(String(amount)),
      },
      request_mode: request_mode || merchant.request_mode || "simple",
      touchpoint: "web",
      iframe_behavior: {
        custom_redirection_url: redirect_url || "",
        language: "FR",
      },
      additional_params: [
        { param_name: "first_name", param_value: customer?.first_name || "" },
        { param_name: "last_name", param_value: customer?.last_name || "" },
        {
          param_name: "phone_number",
          param_value: customer?.phone_number || "",
        },
        {
          param_name: "client_email",
          param_value: customer?.client_email || "",
        },
      ],
    };

    const mipsResponse = await fetch(
      "https://api.mips.mu/api/load_payment_zone",
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

    const rawText = await mipsResponse.text();

    let mipsData: any;
    try {
      mipsData = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          error: "R\u00e9ponse invalide MiPS",
          raw_response: rawText.slice(0, 300),
        },
        { status: 502, headers: getCorsHeaders(origin) },
      );
    }

    const operationStatus =
      mipsData.answer?.operation_status || mipsData.operation_status;
    const paymentZoneData = mipsData.answer?.payment_zone_data || null;
    if (operationStatus !== "success") {
      return NextResponse.json(
        { error: "Erreur cr\u00e9ation paiement", mips_response: mipsData },
        { status: 502, headers: getCorsHeaders(origin) },
      );
    }

    try {
      await supabaseAdmin.from("payments").insert({
        merchant_id: merchant.id,
        id_order,
        amount: parseFloat(String(amount)),
        currency: currencyOverride || merchant.currency || "MUR",
        status: "pending",
        created_at: new Date().toISOString(),
        client_first_name: customer?.first_name || "",
        client_last_name: customer?.last_name || "",
        client_phone_number: customer?.phone_number || "",
      });
    } catch (dbError) {
      console.warn("Erreur DB (non bloquante):", dbError);
    }

    return NextResponse.json(
      {
        success: true,
        payment_id: id_order,
        iframe_html: paymentZoneData,
        mode: paymentZoneData ? "iframe" : "fallback",
      },
      { headers: getCorsHeaders(origin) },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Erreur interne", details: error?.message },
      { status: 500, headers: getCorsHeaders(origin) },
    );
  }
}
