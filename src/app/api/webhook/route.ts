import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabase";
import crypto from "crypto";

type PaymentStatus = "success" | "failed";

type WebhookPayload = {
  crypted_callback: string;
  id_order: string;
  received_at: string;
};

// Désactiver le body parser par défaut pour cette route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getRawBody(req: NextRequest): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";

  let data = "";
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    data += decoder.decode(value);
  }

  return data;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await getRawBody(req);

    // Pour une requête POST avec x-www-form-urlencoded
    const params = new URLSearchParams(rawBody);
    const crypted_callback = params.get("crypted_callback");
    const id_order = params.get("id_order");

    if (!crypted_callback || !id_order) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const secret = process.env.MIPS_WEBHOOK_SECRET;

    if (!secret) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const isSuccess: boolean =
      crypted_callback !== "FAILED" && crypted_callback.length > 0;

    const webhookPayload: WebhookPayload = {
      crypted_callback,
      id_order,
      received_at: new Date().toISOString(),
    };

    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .update({
        status: (isSuccess ? "success" : "failed") as PaymentStatus,
        webhook_payload: webhookPayload,
      })
      .eq("id_order", id_order)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    return NextResponse.json({ message: "success" }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error" },
      { status: 500 },
    );
  }
}

// Optionnel : gérer les autres méthodes HTTP
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
