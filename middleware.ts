import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const PROTECTED = ["/chat"]
const AUTH_ROUTES = ["/login", "/register"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check for a Better Auth session cookie (fast — no DB call)
  const sessionCookie = getSessionCookie(request)
  const isAuthed = Boolean(sessionCookie)

  if (pathname === "/") {
    return isAuthed
      ? NextResponse.redirect(new URL("/chat", request.url))
      : NextResponse.redirect(new URL("/login", request.url))
  }

  // Redirect authenticated users away from login/register
  if (isAuthed && AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/chat", request.url))
  }

  // Redirect unauthenticated users away from protected routes
  if (!isAuthed && PROTECTED.some((r) => pathname.startsWith(r))) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder assets
     * - /api/auth (Better Auth API routes)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/auth).*)",
  ],
}
