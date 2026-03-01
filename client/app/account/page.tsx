"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken, getToken, setCurrentUser } from "@/lib/auth";
import { deleteMyAccount, getMyAccount, updateMyAccount, updateMyPassword } from "@/lib/api";
import { User } from "@/types";

export default function AccountPage() {
  const router = useRouter();
  const uploadsBaseUrl = process.env.NEXT_PUBLIC_UPLOADS_URL ?? "http://localhost:5000";

  const [account, setAccount] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    let active = true;
    const loadAccount = async () => {
      try {
        setLoading(true);
        const payload = await getMyAccount();
        if (!active) {
          return;
        }

        setAccount(payload);
        setName(payload.name || "");
        setCurrentUser(payload);
        setError(null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load account.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadAccount();

    return () => {
      active = false;
    };
  }, [router]);

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextName = name.trim();
    if (!nextName) {
      setError("Name is required.");
      return;
    }

    try {
      setSavingProfile(true);
      const payload = await updateMyAccount({ name: nextName }, profileImageFile);
      setAccount(payload);
      setName(payload.name);
      setProfileImageFile(null);
      setCurrentUser(payload);
      setNotice("Profile updated successfully.");
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update account.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentPassword || !newPassword) {
      setError("Current and new password are required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("New password confirmation does not match.");
      return;
    }

    try {
      setSavingPassword(true);
      const response = await updateMyPassword({ currentPassword, newPassword });
      setNotice(response.message);
      setError(null);
      clearToken();
      router.replace("/login");
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!deletePassword) {
      setError("Current password is required to delete account.");
      return;
    }

    const shouldDelete = window.confirm("Are you sure you want to permanently delete your account?");
    if (!shouldDelete) {
      return;
    }

    try {
      setDeletingAccount(true);
      const response = await deleteMyAccount({ currentPassword: deletePassword });
      setNotice(response.message);
      setError(null);
      clearToken();
      router.replace("/register");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete account.");
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Account</h1>
          <p className="text-sm text-slate-600">Manage your profile, password, and account access.</p>
        </div>
        <Link href="/dashboard" className="button-secondary">
          Back to Dashboard
        </Link>
      </header>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>
      )}

      {loading ? (
        <section className="panel">
          <p className="text-sm text-slate-500">Loading account...</p>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <article className="panel">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Profile Preview</h2>
            {account?.profileImage ? (
              <div className="relative mb-3 h-52 w-full overflow-hidden rounded-lg border border-slate-200">
                <Image
                  src={`${uploadsBaseUrl}${account.profileImage}`}
                  alt={`${account.name} profile`}
                  fill
                  className="object-cover"
                  sizes="320px"
                />
              </div>
            ) : (
              <div className="mb-3 flex h-52 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500">
                No image
              </div>
            )}
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Name:</span> {account?.name || "-"}
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Email:</span> {account?.email || "-"}
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Role:</span> {account?.role || "user"}
            </p>
            <p className="text-xs text-slate-500">
              Updated: {account?.updatedAt ? new Date(account.updatedAt).toLocaleString() : "-"}
            </p>
          </article>

          <div className="space-y-6">
            <article className="panel">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Edit Profile</h2>
              <form onSubmit={handleProfileSave} className="space-y-3">
                <input
                  className="field"
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <input
                  className="field"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setProfileImageFile(event.target.files?.[0] ?? null)}
                />
                <button type="submit" className="button-primary" disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </form>
            </article>

            <article className="panel">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Change Password</h2>
              <form onSubmit={handlePasswordChange} className="space-y-3">
                <input
                  className="field"
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
                <input
                  className="field"
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
                <input
                  className="field"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  required
                />
                <button type="submit" className="button-primary" disabled={savingPassword}>
                  {savingPassword ? "Updating..." : "Update Password"}
                </button>
              </form>
            </article>

            <article className="panel border border-red-200 bg-red-50">
              <h2 className="mb-3 text-lg font-semibold text-red-800">Delete Account</h2>
              <p className="mb-3 text-sm text-red-700">
                This permanently deletes your account, owned trees, members, and subscription data.
              </p>
              <form onSubmit={handleDeleteAccount} className="space-y-3">
                <input
                  className="field"
                  type="password"
                  placeholder="Current password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-70"
                  disabled={deletingAccount}
                >
                  {deletingAccount ? "Deleting..." : "Delete Account"}
                </button>
              </form>
            </article>
          </div>
        </section>
      )}
    </main>
  );
}
