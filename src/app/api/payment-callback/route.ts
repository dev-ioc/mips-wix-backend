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
    const formData = await request.formData();
    const crypted_callback = formData.get("crypted_callback") as string;
    const id_order_param = request.nextUrl.searchParams.get("id_order");

    console.log("[IMN Callback] id_order (URL):", id_order_param);
    console.log(
      "[IMN Callback] crypted_callback reçu:",
      crypted_callback?.slice(0, 50) + "...",
    );

    if (!crypted_callback) {
      console.error("[IMN Callback] crypted_callback manquant");
      return NextResponse.json("fail", { status: 400 });
    }

    const { data: merchants } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("is_active", true);

    if (!merchants || merchants.length === 0) {
      return NextResponse.json("fail", { status: 200 });
    }

    let decryptedData: any = null;
    let matchedMerchant: any = null;

    for (const merchant of merchants) {
      try {
        const basicAuth = Buffer.from(
          `${merchant.auth_basic_username}:${merchant.auth_basic_password}`,
        ).toString("base64");

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
              salt: merchant.imn_salt,
              cipher_key: merchant.imn_cipher_key,
              received_crypted_data: crypted_callback,
            }),
          },
        );

        const raw = await decryptResponse.text();
        console.log("[IMN Callback] Réponse déchiffrement:", raw.slice(0, 200));
        const data = JSON.parse(raw);

        if (data?.id_order) {
          decryptedData = data;
          matchedMerchant = merchant;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!decryptedData || !matchedMerchant) {
      console.error("[IMN Callback] Impossible de déchiffrer");
      return NextResponse.json("success", { status: 200 });
    }

    const {
      id_order,
      status,
      amount,
      currency,
      transaction_id,
      payment_method,
      reason_fail,
    } = decryptedData;

    console.log(`[IMN Callback] id_order: ${id_order}, status: ${status}`);

    const isPaid = status?.toLowerCase() === "success";

    const { error: dbError } = await supabaseAdmin.from("payments").upsert(
      {
        id_order,
        merchant_id: matchedMerchant.id,
        amount: amount ? parseFloat(String(amount)) / 100 : null,
        currency: currency || matchedMerchant.currency,
        status: isPaid ? "paid" : "failed",
        transaction_id: transaction_id || null,
        payment_method: payment_method || null,
        fail_reason: !isPaid ? reason_fail || null : null,
        paid_at: isPaid ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id_order" },
    );

    if (dbError) {
      console.error("[IMN Callback] Erreur DB:", dbError);
    } else {
      console.log(
        `[IMN Callback] Paiement ${id_order} enregistré: ${isPaid ? "paid" : "failed"}`,
      );
    }

    return NextResponse.json("success", { status: 200 });
  } catch (error: any) {
    console.error("[IMN Callback] Erreur interne:", error);
    return NextResponse.json("success", { status: 200 });
  }
}
