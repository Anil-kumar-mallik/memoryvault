"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { resetPasswordWithToken } from "@/lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useMemo(() => (params.get("token") || "").trim(), [params]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError("Reset token is missing.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const payload = await resetPasswordWithToken(token, password);
      setNotice(payload.message || "Password reset successful.");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => router.push("/login"), 1200);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to reset password.");
      setNotice(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
      <section className="panel">
        <h1 className="text-2xl font-bold text-slate-900">Set New Password</h1>
        <p className="mt-1 text-sm text-slate-600">Enter your new password to finish reset.</p>

        {!token && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Reset token is missing from URL.
          </p>
        )}

        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            className="field"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            minLength={8}
            required
            disabled={!token}
          />
          <input
            className="field"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            minLength={8}
            required
            disabled={!token}
          />
          <button type="submit" className="button-primary w-full" disabled={loading || !token}>
            {loading ? "Updating..." : "Update Password"}
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
          <section className="panel">
            <h1 className="text-2xl font-bold text-slate-900">Set New Password</h1>
            <p className="mt-1 text-sm text-slate-600">Loading reset session...</p>
          </section>
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
