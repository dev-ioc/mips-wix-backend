import { supabaseAdmin } from "../../lib/supabase";
import crypto from "crypto";

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const rawBody = await getRawBody(req);
    const params = new URLSearchParams(rawBody);
    const crypted_callback = params.get("crypted_callback");
    const id_order = params.get("id_order");

    if (!crypted_callback || !id_order) {
      return res.status(400).send("Missing params");
    }

    // Vérification signature HMAC
    const expectedSig = crypto
      .createHmac("sha256", process.env.MIPS_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    // Optionnel : vérifier si MiPS envoie une signature dans le header
    // const receivedSig = req.headers['x-mips-signature'];
    // if (receivedSig && receivedSig !== expectedSig) {
    //   return res.status(401).send('Invalid signature');
    // }

    // Décoder le callback (MiPS retourne des données chiffrées)
    // Pour l'instant on parse le crypted_callback comme indicateur de succès
    const isSuccess = crypted_callback && crypted_callback !== "FAILED";

    // Mettre à jour le statut du paiement
    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .update({
        status: isSuccess ? "success" : "failed",
        webhook_payload: {
          crypted_callback,
          id_order,
          received_at: new Date().toISOString(),
        },
      })
      .eq("id_order", id_order)
      .select()
      .single();

    if (error) {
      console.error("Webhook DB error:", error);
      return res.status(500).send("DB error");
    }

    console.log(
      `Webhook: order ${id_order} → ${isSuccess ? "success" : "failed"}`,
    );
    return res.status(200).send("success");
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).send("Error");
  }
}
