import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[IMN Callback] Reçu:", JSON.stringify(body, null, 2));

    const { id_order, payment_status, transaction_id, amount, currency } = body;

    if (!id_order) {
      return NextResponse.json({ error: "id_order manquant" }, { status: 400 });
    }

    await supabaseAdmin
      .from("payments")
      .update({
        status: payment_status === "success" ? "paid" : payment_status,
        transaction_id: transaction_id || null,
        paid_at: payment_status === "success" ? new Date().toISOString() : null,
      })
      .eq("id_order", id_order);

    console.log(
      `[IMN Callback] Paiement ${id_order} mis à jour: ${payment_status}`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("[IMN Callback] Erreur:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { status: "callback endpoint active" },
    { status: 200 },
  );
}
