import type { NextApiRequest, NextApiResponse } from "next";
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

type ApiResponse =
  | {
      payments: Payment[];
      total: number | null;
      summary: Summary;
    }
  | {
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wix_site_id, status = "all", page = "1", limit = "20" } = req.query;

  if (!wix_site_id || typeof wix_site_id !== "string") {
    return res.status(400).json({ error: "wix_site_id requis" });
  }

  try {
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from("payments")
      .select("*", { count: "exact" })
      .eq("wix_site_id", wix_site_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (status !== "all") {
      query = query.eq("status", status as string);
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

    return res.status(200).json({
      payments: (data as Payment[]) || [],
      total: count,
      summary,
    });
  } catch (error: any) {
    console.error("get-payments error:", error);

    return res.status(500).json({
      error: error?.message || "Erreur serveur",
    });
  }
}
