import { createClient } from "@/app/utils/server";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mips-payments.dev-mdg.workers.dev",
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
    const supabase = await createClient();
    const { email, password } = await req.json();

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, password")
      .eq("email", email)
      .maybeSingle();

    if (error || !user) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404, headers: corsHeaders },
      );
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return NextResponse.json(
        { error: "Mot de passe incorrect" },
        { status: 401, headers: corsHeaders },
      );
    }

    const token = jwt.sign({ user_id: user.id, email: user.email }, SECRET, {
      expiresIn: "1d",
    });

    return NextResponse.json(
      { success: true, token },
      { status: 200, headers: corsHeaders },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders },
    );
  }
}
