import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabase";
import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

type PaymentStatus = "success" | "failed";

type WebhookPayload = {
  crypted_callback: string;
  id_order: string;
  received_at: string;
};

async function getRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });

    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).end("Method not allowed");
  }

  try {
    const rawBody = await getRawBody(req);

    const params = new URLSearchParams(rawBody);
    const crypted_callback = params.get("crypted_callback");
    const id_order = params.get("id_order");

    if (!crypted_callback || !id_order) {
      return res.status(400).send("Missing params");
    }
    const secret = process.env.MIPS_WEBHOOK_SECRET;

    if (!secret) {
      return res.status(500).send("Server misconfigured");
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
      return res.status(500).send("DB error");
    }
    return res.status(200).send("success");
  } catch (error: any) {
    return res.status(500).send(error?.message || "Error");
  }
}
