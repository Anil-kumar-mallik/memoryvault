"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cancelMySubscription, createRazorpayOrder, getAvailablePlans, getMySubscription, verifyRazorpayPayment } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/provider";
import { BillingCycle, Plan, SubscriptionSummaryResponse } from "@/types";

type RazorpaySuccessPayload = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccessPayload) => void;
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayFailurePayload = {
  error?: {
    description?: string;
  };
};

type RazorpayInstance = {
  open: () => void;
  on: (eventName: string, callback: (payload: RazorpayFailurePayload) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const loadRazorpayCheckoutScript = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Window is not available."));
      return;
    }

    if (window.Razorpay) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout script."));
    document.body.appendChild(script);
  });

const MOST_POPULAR_PLAN_NAME = "pro";

function formatInr(amount: number): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount);

  return `\u20B9${formatted}`;
}

export default function PricingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [summary, setSummary] = useState<SubscriptionSummaryResponse | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [loading, setLoading] = useState(true);
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [plansPayload, summaryPayload] = await Promise.all([getAvailablePlans(), getMySubscription()]);
      setPlans(plansPayload);
      setSummary(summaryPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load pricing data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    void loadData();
  }, [loadData, router]);

  const handleSubscribe = async (planId: string) => {
    try {
      setSubscribingPlanId(planId);
      setError(null);
      setNotice(null);

      const selectedPlan = plans.find((plan) => plan._id === planId);
      if (!selectedPlan) {
        throw new Error("Selected plan not found.");
      }

      const selectedPrice = billingCycle === "yearly" ? selectedPlan.priceYearly : selectedPlan.priceMonthly;
      if (!selectedPrice) {
        setNotice("Free plan is assigned automatically. No payment is required.");
        await loadData();
        return;
      }

      const order = await createRazorpayOrder(planId, billingCycle);
      await loadRazorpayCheckoutScript();

      const RazorpayCheckout = window.Razorpay;
      if (!RazorpayCheckout) {
        throw new Error("Razorpay checkout is unavailable.");
      }

      await new Promise<void>((resolve, reject) => {
        let finished = false;

        const onResolved = () => {
          if (finished) {
            return;
          }
          finished = true;
          resolve();
        };

        const onRejected = (error: Error) => {
          if (finished) {
            return;
          }
          finished = true;
          reject(error);
        };

        const checkout = new RazorpayCheckout({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "MemoryVault",
          description: `${order.planName} (${order.billingCycle})`,
          order_id: order.orderId,
          handler: (response: RazorpaySuccessPayload) => {
            void (async () => {
              try {
                await verifyRazorpayPayment({
                  planId,
                  billingCycle,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                });
                onResolved();
              } catch (verifyError) {
                onRejected(
                  verifyError instanceof Error ? verifyError : new Error("Failed to verify payment with server.")
                );
              }
            })();
          },
          modal: {
            ondismiss: () => {
              onRejected(new Error("Payment checkout was cancelled."));
            }
          }
        });

        checkout.on("payment.failed", (payload: RazorpayFailurePayload) => {
          const message = payload.error?.description || "Payment failed.";
          onRejected(new Error(message));
        });

        checkout.open();
      });

      router.push("/dashboard?payment=success");
    } catch (subscribeError) {
      setError(subscribeError instanceof Error ? subscribeError.message : "Failed to subscribe to plan.");
    } finally {
      setSubscribingPlanId(null);
    }
  };

  const handleCancel = async () => {
    try {
      setCancelling(true);
      setError(null);
      setNotice(null);
      await cancelMySubscription();
      setNotice("Subscription cancelled.");
      await loadData();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Failed to cancel subscription.");
    } finally {
      setCancelling(false);
    }
  };

  const currentPlanId = summary?.plan?._id || null;

  const usageLabel = useMemo(() => {
    if (!summary) {
      return "";
    }

    return `Trees ${summary.usage.treesUsed}/${summary.usage.maxTrees} | Members ${summary.usage.membersUsed}/${summary.usage.maxMembers}`;
  }, [summary]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t("pricing.title")}</h1>
          <p className="text-sm text-slate-600">{t("pricing.subtitle")}</p>
        </div>
        <Link href="/dashboard" className="button-secondary">
          {t("nav.dashboard")}
        </Link>
      </header>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <section className="mb-6 grid gap-4 md:grid-cols-[1.5fr_1fr]">
        <article className="panel">
          <h2 className="text-lg font-semibold text-slate-900">{t("pricing.currentPlan")}</h2>
          {loading ? (
            <p className="mt-2 text-sm text-slate-500">{t("common.loading")}</p>
          ) : summary?.hasActiveSubscription && summary.plan ? (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p className="text-base font-semibold text-slate-900">{summary.plan.name}</p>
              <p>{usageLabel}</p>
              {summary.subscription?.endDate && (
                <p>
                  {t("pricing.renewsOn")}: {new Date(summary.subscription.endDate).toLocaleDateString()}
                </p>
              )}
              <button type="button" className="button-secondary mt-2" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? t("pricing.cancelling") : t("pricing.cancel")}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">{t("pricing.noPlan")}</p>
          )}
        </article>

        <article className="panel">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Billing</h2>
          <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                billingCycle === "monthly" ? "bg-brand-500 text-white" : "text-slate-700"
              }`}
              onClick={() => setBillingCycle("monthly")}
            >
              {t("pricing.monthly")}
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                billingCycle === "yearly" ? "bg-brand-500 text-white" : "text-slate-700"
              }`}
              onClick={() => setBillingCycle("yearly")}
            >
              {t("pricing.yearly")}
            </button>
          </div>
        </article>
      </section>

      {loading ? (
        <div className="panel text-sm text-slate-500">{t("common.loading")}</div>
      ) : plans.length === 0 ? (
        <div className="panel text-sm text-slate-500">No active plans available.</div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const price = billingCycle === "monthly" ? plan.priceMonthly : plan.priceYearly;
            const isCurrentPlan = currentPlanId === plan._id && summary?.hasActiveSubscription;
            const isMostPopular = String(plan.name || "").trim().toLowerCase() === MOST_POPULAR_PLAN_NAME;

            return (
              <article
                key={plan._id}
                className={`panel relative flex flex-col ${
                  isMostPopular ? "border-2 border-brand-500 bg-brand-50/30 shadow-lg" : ""
                }`}
              >
                {isMostPopular && (
                  <span className="absolute right-3 top-3 rounded-full bg-brand-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
                <p className="mt-2 text-2xl font-bold text-brand-700">
                  {formatInr(price)}
                  <span className="ml-1 text-sm font-medium text-slate-500">/{billingCycle === "monthly" ? "mo" : "yr"}</span>
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  Trees: {plan.maxTrees} | Members: {plan.maxMembers}
                </p>
                {plan.features.length > 0 && (
                  <ul className="mt-3 flex-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="button-primary mt-4 w-full"
                  onClick={() => void handleSubscribe(plan._id)}
                  disabled={Boolean(subscribingPlanId) || Boolean(isCurrentPlan)}
                >
                  {isCurrentPlan ? "Current Plan" : subscribingPlanId === plan._id ? "Processing..." : t("pricing.subscribe")}
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
