"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { requestPasswordReset } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError(null);
      const payload = await requestPasswordReset(email.trim());
      setNotice(payload.message || "If the account exists, a reset email has been sent.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to request password reset.");
      setNotice(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
      <section className="panel">
        <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
        <p className="mt-1 text-sm text-slate-600">Enter your account email to receive a password reset link.</p>

        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            className="field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            required
          />
          <button type="submit" className="button-primary w-full" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Back to{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-500">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}
