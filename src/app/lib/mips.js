import axios from "axios";

const MIPS_API_URL = process.env.MIPS_API_URL;

export async function createPaymentRequest({
  credentials,
  paymentData,
  clientData,
}) {
  const payload = {
    authentify: {
      id_merchant: credentials.id_merchant,
      id_entity: credentials.id_entity,
      id_operator: credentials.id_operator,
      operator_password: credentials.operator_password,
    },
    request: {
      request_mode: "simple",
      options: "none",
      sending_mode: "none", // on gère nous-mêmes la redirection
      request_title: paymentData.title || "Paiement",
      exp_date: paymentData.exp_date || getExpDate(7), // 7 jours
      client_details: {
        first_name: clientData.first_name || "",
        last_name: clientData.last_name || "",
        client_email: clientData.email || "",
        phone_number: clientData.phone || "",
      },
    },
    initial_payment: {
      id_order: paymentData.id_order,
      currency: credentials.currency || "MUR",
      amount: parseFloat(paymentData.amount),
    },
    iframe_behavior: {
      custom_redirection_url: paymentData.redirect_url || "",
    },
  };

  try {
    const response = await axios.post(
      `${MIPS_API_URL}/create_payment_request`,
      payload,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "user-agent": "WixMiPS/1.0",
        },
        timeout: 30000,
      },
    );
    return { success: true, data: response.data };
  } catch (error) {
    const errData = error.response?.data || error.message;
    return { success: false, error: errData };
  }
}

function getExpDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}
