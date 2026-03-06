import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const participantId = request.cookies.get("participant_id")
  const isLoginPage = request.nextUrl.pathname === "/login"

  if (!participantId && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (participantId && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/researcher/:path*", "/login"],
}
