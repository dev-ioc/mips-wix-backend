import { supabaseAdmin } from "../../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const {
    wix_site_id,
    wix_instance_id,
    id_merchant,
    id_entity,
    id_operator,
    operator_password,
    currency,
  } = req.body;

  if (
    !wix_site_id ||
    !id_merchant ||
    !id_entity ||
    !id_operator ||
    !operator_password
  ) {
    return res
      .status(400)
      .json({ error: "Tous les champs credentials sont requis" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("merchants")
      .upsert(
        {
          wix_site_id,
          wix_instance_id,
          id_merchant,
          id_entity,
          id_operator,
          operator_password,
          currency: currency || "MUR",
          is_active: true,
        },
        { onConflict: "wix_site_id" },
      )
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, merchant_id: data.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
