import { NextResponse } from "next/server";

import { createSessionFromIdToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SessionRequestBody {
  idToken?: unknown;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SessionRequestBody;
    const idToken = typeof payload.idToken === "string" ? payload.idToken : "";

    if (!idToken) {
      return NextResponse.json({ message: "Missing Firebase ID token." }, { status: 400 });
    }

    const session = await createSessionFromIdToken(idToken);
    return NextResponse.json({
      ok: true,
      role: session.role,
      email: session.email,
    });
  } catch (error) {
    console.error("[moorings.ms] Unable to create Firebase session.", error);
    return NextResponse.json(
      { message: "Unable to create session. Please check your credentials and try again." },
      { status: 401 },
    );
  }
}
