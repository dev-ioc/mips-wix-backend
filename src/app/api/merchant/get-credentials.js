import { supabaseAdmin } from "../../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { wix_site_id } = req.query;
  if (!wix_site_id)
    return res.status(400).json({ error: "wix_site_id requis" });

  try {
    const { data, error } = await supabaseAdmin
      .from("merchants")
      .select(
        "id, wix_site_id, id_merchant, id_entity, id_operator, currency, is_active, created_at",
      )
      // NE PAS retourner operator_password au frontend !
      .eq("wix_site_id", wix_site_id)
      .single();

    if (error) return res.status(404).json({ configured: false });

    return res.status(200).json({ configured: true, merchant: data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
