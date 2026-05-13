import axios, { AxiosError, AxiosResponse } from "axios";

const MIPS_API_URL = process.env.MIPS_API_URL;

interface Credentials {
  id_merchant: string;
  id_entity: string;
  id_operator: string;
  operator_password: string;
  currency?: string;
}
interface PaymentData {
  id_order: string;
  amount: string | number;
  title?: string;
  exp_date?: string;
  redirect_url?: string;
}

// Types pour les données client
interface ClientData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

interface MipsApiResponse {
  operation_status: "success" | "failed";
  operation_details?: string;
  payment_link?: {
    url: string;
    qr_code?: string;
  };
  [key: string]: any;
}

interface AuthentifyPayload {
  id_merchant: string;
  id_entity: string;
  id_operator: string;
  operator_password: string;
}

interface RequestPayload {
  request_mode: string;
  options: string;
  sending_mode: string;
  request_title: string;
  exp_date: string;
  client_details: {
    first_name: string;
    last_name: string;
    client_email: string;
    phone_number: string;
  };
}

interface InitialPaymentPayload {
  id_order: string;
  currency: string;
  amount: number;
}

interface IframeBehaviorPayload {
  custom_redirection_url: string;
}

interface CreatePaymentPayload {
  authentify: AuthentifyPayload;
  request: RequestPayload;
  initial_payment: InitialPaymentPayload;
  iframe_behavior: IframeBehaviorPayload;
}

interface CreatePaymentResult {
  success: boolean;
  data?: MipsApiResponse;
  error?: any;
}

/**
 * Crée une requête de paiement auprès de l'API MiPS
 * @param credentials - Les credentials du marchand
 * @param paymentData - Les données de paiement
 * @param clientData - Les données du client
 * @returns Le résultat de la requête
 */
export async function createPaymentRequest({
  credentials,
  paymentData,
  clientData,
}: {
  credentials: Credentials;
  paymentData: PaymentData;
  clientData: ClientData;
}): Promise<CreatePaymentResult> {
  if (
    !credentials.id_merchant ||
    !credentials.id_entity ||
    !credentials.id_operator ||
    !credentials.operator_password
  ) {
    return {
      success: false,
      error: "Credentials incomplets. Vérifiez vos identifiants MiPS.",
    };
  }

  if (!paymentData.id_order || !paymentData.amount) {
    return {
      success: false,
      error: "Données de paiement incomplètes. id_order et amount sont requis.",
    };
  }

  const payload: CreatePaymentPayload = {
    authentify: {
      id_merchant: credentials.id_merchant,
      id_entity: credentials.id_entity,
      id_operator: credentials.id_operator,
      operator_password: credentials.operator_password,
    },
    request: {
      request_mode: "simple",
      options: "none",
      sending_mode: "none",
      request_title: paymentData.title || "Paiement",
      exp_date: paymentData.exp_date || getExpDate(7),
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
      amount:
        typeof paymentData.amount === "string"
          ? parseFloat(paymentData.amount)
          : paymentData.amount,
    },
    iframe_behavior: {
      custom_redirection_url: paymentData.redirect_url || "",
    },
  };
  if (!MIPS_API_URL) {
    return {
      success: false,
      error: "MIPS_API_URL non configurée dans les variables d'environnement",
    };
  }

  try {
    const response: AxiosResponse<MipsApiResponse> = await axios.post(
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

    if (response.data.operation_status === "success") {
      return { success: true, data: response.data };
    } else {
      return {
        success: false,
        error:
          response.data.operation_details ||
          "Erreur lors de la création du paiement",
      };
    }
  } catch (error) {
    if (error instanceof AxiosError) {
      const errData = error.response?.data || error.message;
      console.error("Erreur API MiPS:", errData);
      return { success: false, error: errData };
    }
    const errMessage =
      error instanceof Error ? error.message : "Erreur inconnue";
    console.error("Erreur inattendue:", errMessage);
    return { success: false, error: errMessage };
  }
}

/**
 * Calcule une date d'expiration à partir du nombre de jours spécifié
 * @param daysFromNow - Nombre de jours à partir d'aujourd'hui
 * @returns Date au format YYYY-MM-DD
 */
function getExpDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}
export type {
  Credentials,
  PaymentData,
  ClientData,
  MipsApiResponse,
  CreatePaymentResult,
};
