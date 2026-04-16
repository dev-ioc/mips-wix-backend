import { createClient } from "@/app/utils/server";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    console.time("login");

    const supabase = await createClient();
    const { email, password } = await req.json();

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, password")
      .eq("email", email)
      .maybeSingle();

    if (error || !user) {
      return new NextResponse(
        JSON.stringify({ error: "Utilisateur introuvable" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return new NextResponse(
        JSON.stringify({ error: "Mot de passe incorrect" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    const token = jwt.sign({ user_id: user.id, email: user.email }, SECRET, {
      expiresIn: "1d",
    });

    console.timeEnd("login");

    return new NextResponse(JSON.stringify({ success: true, token }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
