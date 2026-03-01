"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import TreeCanvas from "@/components/TreeCanvas";
import {
  clearTreeAccessPassword,
  clearTreeAccessToken,
  getPublicTreeBySlug,
  getTreeFocus,
  setTreeAccessPassword
} from "@/lib/api";
import { useI18n } from "@/lib/i18n/provider";
import { Member, MemberWithRelationsResponse, TreeDetails, TreeFocusResponse } from "@/types";

function mergeUniqueMembers(members: Member[]): Member[] {
  const byId = new Map<string, Member>();
  for (const member of members) {
    byId.set(member._id, member);
  }
  return Array.from(byId.values());
}

function mapTreeFocusToBundle(payload: TreeFocusResponse): MemberWithRelationsResponse {
  const center = payload.center;
  const father = center.fatherId ? payload.parents.find((member) => member._id === center.fatherId) || null : null;
  const mother = center.motherId ? payload.parents.find((member) => member._id === center.motherId) || null : null;
  const nodes = mergeUniqueMembers([center, ...payload.parents, ...payload.spouses, ...payload.siblings, ...payload.children]);
  const relationMeta = payload.relationMeta || {
    spouses: {
      total: payload.spouses.length,
      loaded: payload.spouses.length,
      limit: payload.spouses.length,
      hasMore: false
    },
    siblings: {
      total: payload.siblings.length,
      loaded: payload.siblings.length,
      limit: payload.siblings.length,
      hasMore: false
    },
    children: {
      total: payload.children.length,
      loaded: payload.children.length,
      page: 1,
      limit: payload.children.length,
      hasMore: false
    }
  };

  return {
    focus: center,
    relations: {
      father,
      mother,
      spouses: payload.spouses,
      siblings: payload.siblings,
      children: payload.children
    },
    relationMeta,
    nodes
  };
}

export default function PublicTreePage() {
  const { t } = useI18n();
  const params = useParams<{ slug: string }>();
  const slug = useMemo(() => {
    const raw = params.slug;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.slug]);

  const [tree, setTree] = useState<TreeDetails | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusBundle, setFocusBundle] = useState<MemberWithRelationsResponse | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingFocus, setLoadingFocus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const isPasswordError = (message: string) => {
    const normalized = message.toLowerCase();
    return normalized.includes("password") || normalized.includes("private");
  };

  const loadTree = useCallback(
    async (candidatePassword?: string) => {
      try {
        setLoadingTree(true);
        const payload = await getPublicTreeBySlug(slug, candidatePassword);
        setTree(payload);
        setFocusId((current) => current || payload.rootMemberId || payload.rootMember || payload.initialFocusMember || null);

        if (candidatePassword) {
          setTreeAccessPassword(payload._id, candidatePassword);
        }

        setRequiresPassword(false);
        setPasswordError(null);
        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load tree.";
        if (isPasswordError(message)) {
          if (tree?._id) {
            clearTreeAccessPassword(tree._id);
            clearTreeAccessToken(tree._id);
          }
          setTree(null);
          setFocusBundle(null);
          setRequiresPassword(true);
          setPasswordError(message);
          return;
        }

        setError(message);
      } finally {
        setLoadingTree(false);
      }
    },
    [slug, tree?._id]
  );

  const loadFocus = useCallback(
    async (targetTreeId: string, targetFocusId: string) => {
      try {
        setLoadingFocus(true);
        const payload = await getTreeFocus(targetTreeId, targetFocusId, {
          childrenPage: 1,
          childrenLimit: 90,
          spouseLimit: 70,
          siblingLimit: 70
        });
        setFocusBundle(mapTreeFocusToBundle(payload));
        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load tree focus.";
        if (isPasswordError(message)) {
          clearTreeAccessPassword(targetTreeId);
          clearTreeAccessToken(targetTreeId);
          setRequiresPassword(true);
          setPasswordError(message);
          setFocusBundle(null);
          return;
        }
        setError(message);
      } finally {
        setLoadingFocus(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!slug) {
      return;
    }

    setTree(null);
    setFocusBundle(null);
    setFocusId(null);
    setRequiresPassword(false);
    setPasswordError(null);
    void loadTree();
  }, [loadTree, slug]);

  useEffect(() => {
    if (!tree || !focusId) {
      setFocusBundle(null);
      return;
    }

    void loadFocus(tree._id, focusId);
  }, [focusId, loadFocus, tree]);

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordInput.trim()) {
      setPasswordError("Tree password is required.");
      return;
    }

    try {
      setPasswordSubmitting(true);
      await loadTree(passwordInput.trim());
      setPasswordInput("");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const copyShareLink = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setError(null);
    } catch (_error) {
      setError("Failed to copy public link.");
    }
  };

  const openShare = (platform: "twitter" | "facebook" | "whatsapp") => {
    if (typeof window === "undefined") {
      return;
    }

    const encodedUrl = encodeURIComponent(window.location.href);
    const encodedText = encodeURIComponent(`MemoryVault Family Tree: ${tree?.name || "Tree"}`);

    const url =
      platform === "twitter"
        ? `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`
        : platform === "facebook"
          ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
          : `https://wa.me/?text=${encodedText}%20${encodedUrl}`;

    window.open(url, "_blank", "noopener,noreferrer,width=760,height=640");
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {loadingTree ? t("tree.loadingTree") : tree?.name || t("tree.familyTree")}
          </h1>
          <p className="text-sm text-slate-600">
            {t("tree.privacy")}: <span className="font-semibold">{tree?.privacy || "-"}</span> | {t("tree.members")}:{" "}
            <span className="font-semibold">{tree?.memberCount ?? 0}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className="button-secondary" onClick={() => void copyShareLink()}>
            {t("tree.shareCopy")}
          </button>
          <button type="button" className="button-secondary" onClick={() => openShare("twitter")}>
            {t("tree.shareTwitter")}
          </button>
          <button type="button" className="button-secondary" onClick={() => openShare("facebook")}>
            {t("tree.shareFacebook")}
          </button>
          <button type="button" className="button-secondary" onClick={() => openShare("whatsapp")}>
            {t("tree.shareWhatsapp")}
          </button>
          <Link href="/dashboard" className="button-secondary">
            {t("nav.dashboard")}
          </Link>
        </div>
      </header>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <article className="panel">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">{t("tree.focusNode")}</h2>
            {!focusBundle ? (
              <p className="text-sm text-slate-600">{t("common.loading")}</p>
            ) : (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="font-semibold text-slate-900">{t("tree.name")}:</span> {focusBundle.focus.name}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">{t("tree.father")}:</span>{" "}
                  {focusBundle.relations.father ? focusBundle.relations.father.name : t("common.notAvailable")}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">{t("tree.mother")}:</span>{" "}
                  {focusBundle.relations.mother ? focusBundle.relations.mother.name : t("common.notAvailable")}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">{t("tree.spouses")}:</span> {focusBundle.relationMeta.spouses.total}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">{t("tree.children")}:</span> {focusBundle.relationMeta.children.total}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">{t("tree.siblings")}:</span> {focusBundle.relationMeta.siblings.total}
                </p>
              </div>
            )}
          </article>
        </aside>

        <div className="relative">
          <TreeCanvas bundle={focusBundle} onFocusChange={setFocusId} onNodeInfo={() => {}} />
          {loadingFocus && (
            <div className="pointer-events-none absolute inset-0 rounded-xl border border-slate-200/70 bg-white/60 p-6 backdrop-blur-[1px]">
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
                <p className="text-sm font-medium text-slate-700">{t("tree.loadingFocus")}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {requiresPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-slate-900">Private Tree Access</h2>
            <p className="mt-2 text-sm text-slate-600">Enter the tree password to continue.</p>
            {passwordError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {passwordError}
              </p>
            )}
            <form onSubmit={submitPassword} className="mt-4 space-y-3">
              <input
                className="field"
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder="Tree password"
                required
              />
              <div className="flex gap-2">
                <button type="submit" className="button-primary flex-1" disabled={passwordSubmitting}>
                  {passwordSubmitting ? "Verifying..." : "Unlock Tree"}
                </button>
                <Link href="/dashboard" className="button-secondary flex-1 text-center">
                  Back
                </Link>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
