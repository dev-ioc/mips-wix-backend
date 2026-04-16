import { supabaseAdmin } from "../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { wix_site_id, status, page = 1, limit = 20 } = req.query;
  if (!wix_site_id)
    return res.status(400).json({ error: "wix_site_id requis" });

  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = supabaseAdmin
      .from("payments")
      .select("*", { count: "exact" })
      .eq("wix_site_id", wix_site_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (status && status !== "all") query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;

    // Stats
    const { data: stats } = await supabaseAdmin
      .from("payments")
      .select("status, amount")
      .eq("wix_site_id", wix_site_id);

    const summary = {
      total: stats?.length || 0,
      success: stats?.filter((p) => p.status === "success").length || 0,
      pending: stats?.filter((p) => p.status === "pending").length || 0,
      failed: stats?.filter((p) => p.status === "failed").length || 0,
      total_amount:
        stats
          ?.filter((p) => p.status === "success")
          .reduce((s, p) => s + parseFloat(p.amount), 0) || 0,
    };

    return res.status(200).json({ payments: data, total: count, summary });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
