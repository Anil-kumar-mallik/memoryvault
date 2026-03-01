"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { getToken, setCsrfToken, setCurrentUser, setToken } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError(null);

      const data = await login({ email, password });

      if (!data?.token) {
        setError("Token missing in login response.");
        return;
      }

      setToken(data.token);

      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }

      if (data.user) {
        setCurrentUser(data.user);
      }
      router.push("/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
      <section className="panel">
        <h1 className="text-2xl font-bold text-slate-900">Login</h1>
        <p className="mt-1 text-sm text-slate-600">Access your MemoryVault account.</p>

        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            className="field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            required
          />
          <input
            className="field"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
          <button type="submit" className="button-primary w-full" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-3 text-sm text-slate-600">
          <Link href="/forgot-password" className="font-semibold text-brand-700 hover:text-brand-500">
            Forgot password?
          </Link>
        </p>

        <p className="mt-4 text-sm text-slate-600">
          Need an account?{" "}
          <Link href="/register" className="font-semibold text-brand-700 hover:text-brand-500">
            Register
          </Link>
        </p>
      </section>
    </main>
  );
}
