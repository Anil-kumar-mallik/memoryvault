"use client";

import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
      <section className="panel">
        <h1 className="text-2xl font-bold text-slate-900">Email Verification Disabled</h1>
        <p className="mt-3 text-sm text-slate-700">Email verification is no longer required for MemoryVault accounts.</p>
        <Link href="/login" className="button-primary mt-5 inline-flex items-center justify-center">
          Continue to Login
        </Link>
      </section>
    </main>
  );
}
