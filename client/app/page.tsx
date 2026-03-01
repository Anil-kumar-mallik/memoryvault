"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearToken, getCurrentUser, getToken } from "@/lib/auth";
import { createTree, deleteTree, getMySubscription, getMyTrees, updateTreeSettings } from "@/lib/api";
import { FamilyTree, SubscriptionSummaryResponse, TreePrivacy, TreeSettingsPayload, User } from "@/types";
import { useI18n } from "@/lib/i18n/provider";

type TreeFormState = {
  name: string;
  description: string;
  privacy: TreePrivacy;
  treePassword: string;
};

const initialCreateForm: TreeFormState = {
  name: "",
  description: "",
  privacy: "private",
  treePassword: ""
};

export default function HomePage() {
  const { t } = useI18n();
  const [trees, setTrees] = useState<FamilyTree[]>([]);
  const [createForm, setCreateForm] = useState<TreeFormState>(initialCreateForm);
  const [loading, setLoading] = useState(true);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingTreeId, setUpdatingTreeId] = useState<string | null>(null);
  const [deletingTreeId, setDeletingTreeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummaryResponse | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTreeId, setEditTreeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TreeFormState>(initialCreateForm);

  const router = useRouter();
  const pathname = usePathname();

  const loadTrees = async () => {
    try {
      setLoading(true);
      const payload = await getMyTrees();
      setTrees(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to fetch family trees.");
    } finally {
      setLoading(false);
    }
  };

  const loadSubscription = async () => {
    try {
      setLoadingSubscription(true);
      const payload = await getMySubscription();
      setSubscription(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to fetch subscription.");
    } finally {
      setLoadingSubscription(false);
    }
  };

  useEffect(() => {
    const token = getToken();

    if (!token) {
      setLoading(false);
      return;
    }

    setIsAuthenticated(true);
    setCurrentUser(getCurrentUser());
    void Promise.all([loadTrees(), loadSubscription()]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payment = new URLSearchParams(window.location.search).get("payment");
    if (payment !== "success") {
      return;
    }

    setNotice(t("pricing.subscribeSuccess"));
    router.replace(pathname || "/dashboard");
  }, [pathname, router, t]);

  const treeLimitReached = Boolean(subscription?.usage.treeLimitReached);
  const hasExistingTree = trees.length > 0;
  const primaryTree = trees[0] || null;

  const createFormPayload = useMemo(() => {
    const payload = {
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      privacy: createForm.privacy as TreePrivacy,
      treePassword: createForm.treePassword.trim()
    };

    return payload;
  }, [createForm]);

  const handleCreateTree = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (treeLimitReached) {
      setError("Tree limit reached for current plan.");
      return;
    }

    if (!createFormPayload.name) {
      setError("Tree name is required.");
      return;
    }

    if (createFormPayload.privacy === "private" && !createFormPayload.treePassword) {
      setError("Private tree requires a password.");
      return;
    }

    try {
      setCreating(true);
      await createTree({
        name: createFormPayload.name,
        description: createFormPayload.description,
        privacy: createFormPayload.privacy,
        treePassword: createFormPayload.privacy === "private" ? createFormPayload.treePassword : undefined
      });

      setCreateForm(initialCreateForm);
      await Promise.all([loadTrees(), loadSubscription()]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create tree.");
      await loadSubscription();
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (tree: FamilyTree) => {
    setEditTreeId(tree._id);
    setEditForm({
      name: tree.name,
      description: tree.description || "",
      privacy: tree.privacy,
      treePassword: ""
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateTreeSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editTreeId) {
      return;
    }

    if (!editForm.name.trim()) {
      setError("Tree name is required.");
      return;
    }

    if (editForm.privacy === "private" && !editForm.treePassword.trim()) {
      const existingTree = trees.find((tree) => tree._id === editTreeId);
      const existingWasPrivate = existingTree?.privacy === "private";

      if (!existingWasPrivate) {
        setError("Tree password is required when switching to private.");
        return;
      }
    }

    const payload: TreeSettingsPayload = {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      privacy: editForm.privacy
    };

    if (editForm.treePassword.trim()) {
      payload.treePassword = editForm.treePassword.trim();
    }

    try {
      setUpdatingTreeId(editTreeId);
      await updateTreeSettings(editTreeId, payload);
      setIsEditModalOpen(false);
      setEditTreeId(null);
      setEditForm(initialCreateForm);
      await Promise.all([loadTrees(), loadSubscription()]);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update tree settings.");
    } finally {
      setUpdatingTreeId(null);
    }
  };

  const handleDeleteTree = async (treeId: string) => {
    const shouldDelete = window.confirm("Delete this tree? This action also removes all members.");
    if (!shouldDelete) {
      return;
    }

    try {
      setDeletingTreeId(treeId);
      await deleteTree(treeId);
      await Promise.all([loadTrees(), loadSubscription()]);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete tree.");
    } finally {
      setDeletingTreeId(null);
    }
  };

  const handleTogglePrivacy = async (tree: FamilyTree) => {
    if (!tree.canEdit) {
      setError("Only tree owner or admin can modify tree settings.");
      return;
    }

    const nextPrivacy: TreePrivacy = tree.privacy === "private" ? "public" : "private";
    const payload: TreeSettingsPayload = {
      privacy: nextPrivacy
    };

    if (nextPrivacy === "private") {
      const password = window.prompt("Set password for private tree (minimum 4 characters):", "");
      if (!password) {
        return;
      }

      const trimmed = password.trim();
      if (trimmed.length < 4) {
        setError("Private tree password must be at least 4 characters.");
        return;
      }

      payload.treePassword = trimmed;
    }

    try {
      setUpdatingTreeId(tree._id);
      await updateTreeSettings(tree._id, payload);
      await loadTrees();
      setError(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to toggle tree privacy.");
    } finally {
      setUpdatingTreeId(null);
    }
  };

  const ownerLabel = (tree: FamilyTree): string => {
    if (typeof tree.owner === "string") {
      return "Owned by you";
    }

    return `${tree.owner.name} (${tree.owner.email})`;
  };

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
    setTrees([]);
    setCurrentUser(null);
    router.push("/login");
  };

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4">
        <section className="panel w-full text-center">
          <h1 className="text-3xl font-bold text-slate-900">{t("common.appName")}</h1>
          <p className="mt-3 text-sm text-slate-600">
            Build and explore dynamic family trees with authentication, privacy controls, and role-aware access.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/login" className="button-primary">
              Login
            </Link>
            <Link href="/register" className="button-secondary">
              Register
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t("dashboard.title")}</h1>
          <p className="text-sm text-slate-600">
            {t("common.role")}: <span className="font-semibold">{currentUser?.role || "user"}</span>
          </p>
        </div>
        <button type="button" onClick={handleLogout} className="button-secondary">
          {t("nav.logout")}
        </button>
      </header>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <article className="panel">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">{t("dashboard.currentPlan")}</h2>
          {loadingSubscription ? (
            <p className="text-sm text-slate-500">{t("common.loading")}</p>
          ) : subscription?.hasActiveSubscription && subscription.plan ? (
            <div className="space-y-1 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{subscription.plan.name}</p>
              <p>
                {t("dashboard.usage")}: {t("dashboard.membersUsage")} {subscription.usage.membersUsed}/{subscription.usage.maxMembers}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">{t("dashboard.noPlan")}</p>
          )}
        </article>
        <article className="panel">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">{t("dashboard.usage")}</h2>
          {loadingSubscription ? (
            <p className="text-sm text-slate-500">{t("common.loading")}</p>
          ) : (
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                {t("dashboard.membersUsage")}: {subscription?.usage.membersUsed ?? 0}/{subscription?.usage.maxMembers ?? 0}
              </p>
              {(subscription?.usage.treeLimitReached || subscription?.usage.memberLimitReached) && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t("dashboard.limitReached")}
                </p>
              )}
              <Link href="/pricing" className="button-primary w-fit">
                {t("dashboard.managePlans")}
              </Link>
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <article className="panel">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {hasExistingTree ? t("nav.myTrees") : t("dashboard.createTree")}
          </h2>
          {hasExistingTree ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">You already have a tree. Open it directly.</p>
              {primaryTree && (
                <Link href={`/tree/${primaryTree._id}`} className="button-primary w-full text-center">
                  {t("dashboard.myTree")}
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={handleCreateTree} className="space-y-3">
              <input
                className="field"
                type="text"
                placeholder="Tree name"
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
              <textarea
                className="field min-h-24"
                placeholder="Description"
                value={createForm.description}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <select
                className="field"
                value={createForm.privacy}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, privacy: event.target.value as TreePrivacy }))
                }
              >
                <option value="private">Private (Password Protected)</option>
                <option value="public">Public</option>
              </select>

              {createForm.privacy === "private" && (
                <input
                  className="field"
                  type="password"
                  placeholder="Tree password"
                  value={createForm.treePassword}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, treePassword: event.target.value }))}
                  minLength={4}
                  required
                />
              )}

              <button type="submit" className="button-primary w-full" disabled={creating || treeLimitReached}>
                {creating ? t("dashboard.creatingButton") : t("dashboard.createButton")}
              </button>
              {treeLimitReached && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t("dashboard.limitReached")}
                </p>
              )}
            </form>
          )}
        </article>

        <article className="panel" id="my-trees">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t("dashboard.listTrees")}</h2>
          {loading ? (
            <p className="text-sm text-slate-500">{t("common.loading")}</p>
          ) : trees.length === 0 ? (
            <p className="text-sm text-slate-500">{t("dashboard.noTrees")}</p>
          ) : (
            <ul className="space-y-3">
              {trees.map((tree) => (
                <li key={tree._id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{tree.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{tree.description || "No description"}</p>
                      <p className="mt-1 text-xs text-slate-500">{ownerLabel(tree)}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        tree.privacy === "private"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {tree.privacy === "private" ? "Private" : "Public"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    {t("dashboard.members")}: {tree.memberCount ?? 0}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/tree/${tree._id}`} className="button-primary text-xs">
                      {t("dashboard.openTree")}
                    </Link>

                    {tree.canEdit && (
                      <>
                        <button
                          type="button"
                          className="button-secondary text-xs"
                          onClick={() => void handleTogglePrivacy(tree)}
                          disabled={updatingTreeId === tree._id}
                        >
                          {updatingTreeId === tree._id
                            ? "Updating..."
                            : tree.privacy === "private"
                              ? t("dashboard.makePublic")
                              : t("dashboard.makePrivate")}
                        </button>
                        <button
                          type="button"
                          className="button-secondary text-xs"
                          onClick={() => openEditModal(tree)}
                          disabled={updatingTreeId === tree._id}
                        >
                          {t("dashboard.editSettings")}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                          onClick={() => handleDeleteTree(tree._id)}
                          disabled={deletingTreeId === tree._id}
                        >
                          {deletingTreeId === tree._id ? t("dashboard.deletingTree") : t("dashboard.deleteTree")}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      {isEditModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Edit Tree Settings</h2>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditTreeId(null);
                }}
              >
                Close
              </button>
            </div>

            <form onSubmit={handleUpdateTreeSettings} className="space-y-3">
              <input
                className="field"
                placeholder="Tree name"
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />

              <textarea
                className="field min-h-24"
                placeholder="Description"
                value={editForm.description}
                onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
              />

              <select
                className="field"
                value={editForm.privacy}
                onChange={(event) => setEditForm((prev) => ({ ...prev, privacy: event.target.value as TreePrivacy }))}
              >
                <option value="private">Private (Password Protected)</option>
                <option value="public">Public</option>
              </select>

              {editForm.privacy === "private" && (
                <input
                  className="field"
                  type="password"
                  placeholder="New tree password (required when moving from public to private)"
                  value={editForm.treePassword}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, treePassword: event.target.value }))}
                  minLength={4}
                />
              )}

              <button type="submit" className="button-primary w-full" disabled={Boolean(updatingTreeId)}>
                {updatingTreeId ? "Saving..." : "Save Settings"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
