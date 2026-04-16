import { createClient } from "@/app/utils/server";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticate } from "@/app/utils/auth";

function withCors(res: NextResponse, req?: NextRequest) {
  const origin = req?.headers.get("origin");

  res.headers.set("Access-Control-Allow-Origin", origin || "*");
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS",
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  return res;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { name, email, password } = body;

    const { data: existing, error: selectError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (selectError) {
      return withCors(
        NextResponse.json({ error: selectError.message }, { status: 500 }),
      );
    }

    if (existing) {
      return withCors(
        NextResponse.json(
          { error: "Cet email est déjà utilisé !" },
          { status: 400 },
        ),
      );
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error: insertError } = await supabase
      .from("users")
      .insert([{ name, email, password: hashedPassword }])
      .select();

    if (insertError) {
      return withCors(
        NextResponse.json({ error: insertError.message }, { status: 500 }),
      );
    }

    if (!data || data.length === 0) {
      return withCors(
        NextResponse.json(
          { error: "Impossible de créer l'utilisateur" },
          { status: 500 },
        ),
      );
    }

    return withCors(
      NextResponse.json({ success: true, user: data[0] }, { status: 201 }),
    );
  } catch (error: any) {
    console.error(error);
    return withCors(
      NextResponse.json({ error: error.message }, { status: 500 }),
    );
  }
}
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user)
      return withCors(
        NextResponse.json({ error: "Non autorisé" }, { status: 401 }),
        req,
      );

    return withCors(NextResponse.json({ user }, { status: 200 }), req);
  } catch (error: any) {
    return withCors(
      NextResponse.json({ error: error.message }, { status: 500 }),
      req,
    );
  }
}
export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });

  return withCors(res, req);
}
