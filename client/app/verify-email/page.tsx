"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { verifyEmailToken } from "@/lib/api";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Verifying your email...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const runVerification = async () => {
      if (!token.trim()) {
        setError("Verification token is missing.");
        setMessage("Unable to verify email.");
        setLoading(false);
        return;
      }

      try {
        const payload = await verifyEmailToken(token.trim());
        if (!active) {
          return;
        }
        setError(null);
        setMessage(payload.message || "Email verified successfully.");
      } catch (verifyError) {
        if (!active) {
          return;
        }
        setError(verifyError instanceof Error ? verifyError.message : "Email verification failed.");
        setMessage("Unable to verify email.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void runVerification();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
      <section className="panel">
        <h1 className="text-2xl font-bold text-slate-900">Email Verification</h1>
        <p className="mt-3 text-sm text-slate-700">{message}</p>
        {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading && <p className="mt-3 text-sm text-slate-500">Please wait...</p>}
        <Link href="/login" className="button-primary mt-5 inline-flex items-center justify-center">
          Continue to Login
        </Link>
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
          <section className="panel">
            <h1 className="text-2xl font-bold text-slate-900">Email Verification</h1>
            <p className="mt-3 text-sm text-slate-700">Verifying your email...</p>
          </section>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
