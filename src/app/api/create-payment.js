import { supabaseAdmin } from "../../lib/supabase";
import { createPaymentRequest } from "../../lib/mips";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  // CORS pour Wix
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      wix_site_id,
      amount,
      title,
      client_first_name,
      client_last_name,
      client_email,
      client_phone,
      redirect_url,
    } = req.body;

    if (!wix_site_id || !amount) {
      return res
        .status(400)
        .json({ error: "wix_site_id et amount sont requis" });
    }

    // Récupérer les credentials du marchand
    const { data: merchant, error: merchantError } = await supabaseAdmin
      .from("merchants")
      .select("*")
      .eq("wix_site_id", wix_site_id)
      .eq("is_active", true)
      .single();

    if (merchantError || !merchant) {
      return res
        .status(404)
        .json({ error: "Marchand non trouvé ou credentials non configurés" });
    }

    // Générer un ID de commande unique
    const id_order = `WIX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    // Appel MiPS
    const mipsResult = await createPaymentRequest({
      credentials: merchant,
      paymentData: {
        id_order,
        amount,
        title: title || "Paiement Wix",
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
      return res
        .status(502)
        .json({ error: "Erreur MiPS", details: mipsResult.error });
    }

    // Sauvegarder le paiement en DB
    const { data: payment, error: dbError } = await supabaseAdmin
      .from("payments")
      .insert({
        merchant_id: merchant.id,
        wix_site_id,
        id_order,
        amount: parseFloat(amount),
        currency: merchant.currency || "MUR",
        status: "pending",
        payment_link: mipsResult.data.payment_link?.url,
        qr_code: mipsResult.data.payment_link?.qr_code,
        client_first_name,
        client_last_name,
        client_email,
        client_phone,
        request_title: title,
        mips_response: mipsResult.data,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return res.status(200).json({
      success: true,
      payment_id: payment.id,
      id_order,
      payment_link: mipsResult.data.payment_link?.url,
      qr_code: mipsResult.data.payment_link?.qr_code,
    });
  } catch (error) {
    console.error("create-payment error:", error);
    return res
      .status(500)
      .json({ error: "Erreur serveur", details: error.message });
  }
}
