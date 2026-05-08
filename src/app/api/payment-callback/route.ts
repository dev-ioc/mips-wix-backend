import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    { status: "callback endpoint active" },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log(
      "[IMN Callback] Données chiffrées reçues:",
      JSON.stringify(body, null, 2),
    );

    const { received_crypted_data, salt, cipher_key, id_merchant } = body;

    if (!received_crypted_data) {
      console.error("[IMN Callback] Pas de données chiffrées");
      return NextResponse.json(
        { error: "received_crypted_data manquant" },
        { status: 400 },
      );
    }

    let merchant: any = null;
    if (id_merchant) {
      const { data } = await supabaseAdmin
        .from("merchants")
        .select("*")
        .eq("id_merchant", id_merchant)
        .eq("is_active", true)
        .single();
      merchant = data;
    }

    if (!merchant) {
      console.error(
        "[IMN Callback] Marchand non trouvé pour id_merchant:",
        id_merchant,
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const basicAuth = Buffer.from(
      `${merchant.auth_basic_username}:${merchant.auth_basic_password}`,
    ).toString("base64");

    console.log("[IMN Callback] Déchiffrement en cours...");
    const decryptResponse = await fetch(
      "https://api.mips.mu/api/decrypt_imn_data",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.78 Safari/537.36",
        },
        body: JSON.stringify({
          authentify: {
            id_merchant: merchant.id_merchant,
            id_entity: merchant.id_entity,
            id_operator: merchant.id_operator,
            operator_password: merchant.operator_password,
          },
          salt: salt || merchant.imn_salt,
          cipher_key: cipher_key || merchant.imn_cipher_key,
          received_crypted_data,
        }),
      },
    );

    const decryptedRaw = await decryptResponse.text();
    console.log(
      "[IMN Callback] Réponse déchiffrement:",
      decryptedRaw.slice(0, 500),
    );

    let decryptedData: any;
    try {
      decryptedData = JSON.parse(decryptedRaw);
    } catch {
      console.error("[IMN Callback] Réponse non-JSON:", decryptedRaw);
      return NextResponse.json({ received: true }, { status: 200 });
    }
    const {
      id_order,
      status,
      amount,
      currency,
      transaction_id,
      payment_method,
      reason_fail,
      additional_param,
    } = decryptedData;

    console.log(
      `[IMN Callback] Paiement déchiffré — id_order: ${id_order}, status: ${status}`,
    );

    if (!id_order) {
      console.error(
        "[IMN Callback] id_order manquant dans les données déchiffrées",
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }
    const updateData: any = {
      status: status === "success" ? "paid" : "failed",
      transaction_id: transaction_id || null,
      payment_method: payment_method || null,
      updated_at: new Date().toISOString(),
    };

    if (status === "success") {
      updateData.paid_at = new Date().toISOString();
    } else {
      updateData.fail_reason = reason_fail || null;
    }

    const { error: dbError } = await supabaseAdmin
      .from("payments")
      .update(updateData)
      .eq("id_order", id_order);

    if (dbError) {
      console.error("[IMN Callback] Erreur DB:", dbError);
    } else {
      console.log(`[IMN Callback] Paiement ${id_order} mis à jour: ${status}`);
    }
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("[IMN Callback] Erreur interne:", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
