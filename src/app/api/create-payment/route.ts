import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createPaymentRequest } from "@/app/lib/mips";

// ✅ CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ✅ OPTIONS (preflight)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// ✅ POST
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      wix_site_id,
      amount,
      title,
      client_first_name,
      client_last_name,
      client_email,
      client_phone,
      redirect_url,
    } = body;

    if (!wix_site_id || !amount) {
      return new NextResponse(
        JSON.stringify({ error: "wix_site_id et amount requis" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // 🔎 merchant
    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("wix_site_id", wix_site_id)
      .single();

    if (!merchant) {
      return new NextResponse(
        JSON.stringify({ error: "Merchant introuvable" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // 🆔 order
    const id_order = `WIX-${Date.now()}-${uuidv4().slice(0, 6)}`;

    // 💳 MiPS
    const mipsResult = await createPaymentRequest({
      credentials: merchant,
      paymentData: {
        id_order,
        amount,
        title,
        redirect_url,
      },
      clientData: {
        first_name: client_first_name,
        last_name: client_last_name,
        email: client_email,
        phone: client_phone,
      },
    });

    if (!mipsResult.success) {
      return new NextResponse(
        JSON.stringify({
          error: "Erreur MiPS",
          details: mipsResult.error,
        }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    // 💾 save
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .insert({
        merchant_id: merchant.id,
        wix_site_id,
        id_order,
        amount: parseFloat(amount),
        status: "pending",
        payment_link: mipsResult.data.payment_link?.url,
        qr_code: mipsResult.data.payment_link?.qr_code,
      })
      .select()
      .single();

    return new NextResponse(
      JSON.stringify({
        success: true,
        payment_id: payment.id,
        id_order,
        payment_link: mipsResult.data.payment_link?.url,
        qr_code: mipsResult.data.payment_link?.qr_code,
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({
        error: "Server error",
        details: e.message,
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}
