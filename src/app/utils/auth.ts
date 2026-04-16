import { NextRequest } from "next/server";
import jwt, { JwtPayload } from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET!;

export interface UserToken extends JwtPayload {
  user_id: number;
  email: string;
}

export function authenticate(req: NextRequest): UserToken | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded === "string") return null;
    return decoded as UserToken;
  } catch {
    return null;
  }
}
