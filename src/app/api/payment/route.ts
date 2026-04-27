import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabase";

type Payment = {
  id: string;
  wix_site_id: string;
  status: "success" | "pending" | "failed";
  amount: string | number;
  created_at: string;
};

type Summary = {
  total: number;
  success: number;
  pending: number;
  failed: number;
  total_amount: number;
};

// Gérer la requête OPTIONS pour CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(req: NextRequest) {
  // Récupérer les paramètres de l'URL
  const searchParams = req.nextUrl.searchParams;
  const wix_site_id = searchParams.get("wix_site_id");
  const status = searchParams.get("status") || "all";
  const page = searchParams.get("page") || "1";
  const limit = searchParams.get("limit") || "20";

  // Définir les headers CORS pour la réponse
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!wix_site_id || typeof wix_site_id !== "string") {
    return NextResponse.json(
      { error: "wix_site_id requis" },
      { status: 400, headers },
    );
  }

  try {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from("payments")
      .select("*", { count: "exact" })
      .eq("wix_site_id", wix_site_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Stats globales
    const { data: stats } = await supabaseAdmin
      .from("payments")
      .select("status, amount")
      .eq("wix_site_id", wix_site_id);

    const summary: Summary = {
      total: stats?.length || 0,
      success: stats?.filter((p) => p.status === "success").length || 0,
      pending: stats?.filter((p) => p.status === "pending").length || 0,
      failed: stats?.filter((p) => p.status === "failed").length || 0,
      total_amount:
        stats
          ?.filter((p) => p.status === "success")
          .reduce((sum, p) => sum + Number(p.amount), 0) || 0,
    };

    return NextResponse.json(
      {
        payments: (data as Payment[]) || [],
        total: count,
        summary,
      },
      { status: 200, headers },
    );
  } catch (error: any) {
    console.error("get-payments error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Erreur serveur",
      },
      { status: 500, headers },
    );
  }
}
