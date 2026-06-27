import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Portal" };

/** Same-origin relative paths only — block //evil.com / /\evil.com open redirects. */
function safeNext(next?: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/catalog";
  return next;
}

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return <LoginForm next={safeNext(searchParams.next)} />;
}
