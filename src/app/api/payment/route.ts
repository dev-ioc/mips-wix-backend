import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  const allowedOrigins = [
    "https://mips-payments.dev-mdg.workers.dev",
    "https://mips-wix-backend.onrender.com",
  ];
  const allowedOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
};

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get("status") || "all";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = (page - 1) * limit;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    let query = supabaseAdmin
      .from("payments")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status === "success") {
      query = query.eq("status", "paid");
    } else if (status === "failed") {
      query = query.eq("status", "failed");
    } else if (status === "pending") {
      query = query.eq("status", "pending");
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const { data: stats } = await supabaseAdmin
      .from("payments")
      .select("status, amount");

    const summary = {
      total: stats?.length || 0,
      success: stats?.filter((p) => p.status === "paid").length || 0,
      pending: stats?.filter((p) => p.status === "pending").length || 0,
      failed: stats?.filter((p) => p.status === "failed").length || 0,
      total_amount:
        stats
          ?.filter((p) => p.status === "paid")
          .reduce((sum, p) => sum + Number(p.amount), 0) || 0,
    };

    const payments = (data || []).map((p: any) => ({
      id: p.id,
      order_id: p.id_order,
      transaction_id: p.transaction_id || "-",
      amount: p.amount,
      currency: p.currency,
      status: p.status === "paid" ? "success" : p.status,
      received_at: p.paid_at || p.created_at,
      client_first_name: p.client_first_name,
      client_last_name: p.client_last_name,
      client_phone_number: p.client_phone_number,
      fail_reason: p.fail_reason,
    }));
    return NextResponse.json(
      { payments, total: count, summary },
      { status: 200, headers: corsHeaders },
    );
  } catch (error: any) {
    console.error("get-payments error:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500, headers: corsHeaders },
    );
  }
}
