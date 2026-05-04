// // backend/app/api/merchant/get-credentials/route.ts
// import { supabaseAdmin } from "@/app/lib/supabase";
// import { NextRequest, NextResponse } from "next/server";

// // ✅ Configuration CORS - version avec valeurs par défaut
// const allowedOrigins = [
//   "https://mips-payments.dev-mdg.workers.dev",
//   process.env.NEXT_PUBLIC_APP_URL,
// ].filter(Boolean) as string[];

// const getCorsHeaders = (origin: string | null): Record<string, string> => {
//   const allowedOrigin =
//     origin && allowedOrigins.includes(origin)
//       ? origin
//       : allowedOrigins[0] || "*";

//   return {
//     "Access-Control-Allow-Origin": allowedOrigin,
//     "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
//     "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
//     "Access-Control-Allow-Credentials": "true",
//     "Access-Control-Max-Age": "86400",
//   };
// };

// type Merchant = {
//   id: string;
//   wix_site_id: string;
//   id_merchant: string;
//   id_entity: string;
//   id_operator: string;
//   currency: string;
//   is_active: boolean;
//   created_at: string;
// };

// export async function OPTIONS(req: NextRequest) {
//   const origin = req.headers.get("origin");
//   return new NextResponse(null, {
//     status: 204,
//     headers: getCorsHeaders(origin),
//   });
// }

// export async function GET(req: NextRequest) {
//   const origin = req.headers.get("origin");

//   try {
//     // Récupérer le token depuis le header Authorization
//     const authHeader = req.headers.get("Authorization");
//     if (!authHeader?.startsWith("Bearer ")) {
//       return NextResponse.json(
//         { error: "Token manquant" },
//         { status: 401, headers: getCorsHeaders(origin) },
//       );
//     }

//     const token = authHeader.replace("Bearer ", "");

//     // Décoder le token pour obtenir l'userId
//     let userId: string | null = null;

//     try {
//       // Essayer de décoder le token JWT
//       const base64Payload = token.split(".")[1];
//       const payload = JSON.parse(atob(base64Payload));
//       userId = payload.id || payload.userId || payload.user_id;
//     } catch (e) {
//       console.error("Erreur décodage token:", e);
//       return NextResponse.json(
//         { error: "Token invalide" },
//         { status: 401, headers: getCorsHeaders(origin) },
//       );
//     }

//     if (!userId) {
//       return NextResponse.json(
//         { error: "userId non trouvé dans le token" },
//         { status: 400, headers: getCorsHeaders(origin) },
//       );
//     }

//     const { data, error } = await supabaseAdmin
//       .from("merchants")
//       .select("*")
//       .eq("user_id", userId)
//       .order("created_at", { ascending: false })
//       .limit(1)
//       .single();

//     if (error) {
//       console.error("Supabase error:", error);
//       return NextResponse.json(
//         { error: error.message },
//         { status: 500, headers: getCorsHeaders(origin) },
//       );
//     }

//     if (!data) {
//       return NextResponse.json(
//         { configured: false, merchant: null },
//         { status: 200, headers: getCorsHeaders(origin) },
//       );
//     }

//     return NextResponse.json(
//       {
//         configured: true,
//         merchant: data as Merchant,
//       },
//       { status: 200, headers: getCorsHeaders(origin) },
//     );
//   } catch (error: any) {
//     console.error("get-credentials error:", error);
//     return NextResponse.json(
//       { error: error?.message || "Erreur serveur" },
//       { status: 500, headers: getCorsHeaders(origin) },
//     );
//   }
// }

// backend/app/api/merchant/get-credentials/route.ts
import { supabaseAdmin } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// ✅ Configuration CORS - Version corrigée pour inclure static.parastorage.com
const allowedOrigins = [
  "https://mips-payments.dev-mdg.workers.dev",
  "https://static.parastorage.com",
  "https://editor.wix.com",
  "https://www.wix.com",
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  // Vérifier si l'origine est autorisée
  let allowedOrigin = "*";

  if (origin) {
    // Permettre toutes les origines Wix/parastorage
    if (
      origin.includes("parastorage.com") ||
      origin.includes("wix.com") ||
      allowedOrigins.includes(origin)
    ) {
      allowedOrigin = origin;
    }
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
};

type Merchant = {
  id: string;
  wix_site_id: string;
  user_id: string;
  id_merchant: string;
  id_entity: string;
  id_operator: string;
  operator_password?: string;
  currency: string;
  sending_mode?: string;
  request_mode?: string;
  is_active: boolean;
  created_at: string;
};

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const publicKey = url.searchParams.get("public_key");
  const wixSiteId = url.searchParams.get("wix_site_id");

  console.log("🔑 GET /api/merchant/get-credentials", {
    publicKey: publicKey?.substring(0, 20),
    wixSiteId,
  });

  try {
    let result;

    // Mode 1: Recherche par clé publique (pour le Web Component)
    if (publicKey) {
      console.log(
        "🔍 Recherche par clé publique:",
        publicKey.substring(0, 20) + "...",
      );

      const { data, error } = await supabaseAdmin
        .from("merchants")
        .select("*")
        .eq("public_key", publicKey) // Assurez-vous que cette colonne existe
        .eq("is_active", true)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = not found
        console.error("Supabase error:", error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500, headers: getCorsHeaders(origin) },
        );
      }

      if (data) {
        result = data;
      }
    }

    // Mode 2: Recherche par wix_site_id (pour l'éditeur Wix)
    if (!result && wixSiteId) {
      console.log("🔍 Recherche par wix_site_id:", wixSiteId);

      const { data, error } = await supabaseAdmin
        .from("merchants")
        .select("*")
        .eq("wix_site_id", wixSiteId)
        .eq("is_active", true)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Supabase error:", error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500, headers: getCorsHeaders(origin) },
        );
      }

      if (data) {
        result = data;
      }
    }

    // Mode 3: Recherche par token (pour l'éditeur Wix avec authentification)
    if (!result) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");

        try {
          const base64Payload = token.split(".")[1];
          const payload = JSON.parse(atob(base64Payload));
          const userId = payload.id || payload.userId || payload.user_id;

          if (userId) {
            console.log("🔍 Recherche par userId:", userId);

            const { data, error } = await supabaseAdmin
              .from("merchants")
              .select("*")
              .eq("user_id", userId)
              .eq("is_active", true)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (error && error.code !== "PGRST116") {
              console.error("Supabase error:", error);
            }

            if (data) {
              result = data;
            }
          }
        } catch (e) {
          console.error("Erreur décodage token:", e);
        }
      }
    }

    // Retourner le résultat
    if (result) {
      console.log("✅ Credentials trouvés pour:", result.id_merchant);

      // Ne pas renvoyer le mot de passe en clair si non nécessaire
      const { operator_password, ...safeResult } = result;

      return NextResponse.json(
        {
          success: true,
          credentials: {
            id_merchant: result.id_merchant,
            id_entity: result.id_entity,
            id_operator: result.id_operator,
            operator_password: result.operator_password, // À garder pour le paiement
            currency: result.currency || "MUR",
            sending_mode: result.sending_mode || "link",
            request_mode: result.request_mode || "simple",
          },
        },
        { status: 200, headers: getCorsHeaders(origin) },
      );
    }

    // Aucune configuration trouvée
    console.log("❌ Aucune configuration trouvée");
    return NextResponse.json(
      {
        success: false,
        configured: false,
        error: "Aucune configuration MiPS trouvée pour cette clé ou ce site",
      },
      { status: 200, headers: getCorsHeaders(origin) },
    );
  } catch (error: any) {
    console.error("get-credentials error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erreur serveur",
      },
      { status: 500, headers: getCorsHeaders(origin) },
    );
  }
}
