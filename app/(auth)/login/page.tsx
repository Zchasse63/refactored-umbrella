import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Portal" };

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return <LoginForm next={searchParams.next ?? "/catalog"} />;
}
