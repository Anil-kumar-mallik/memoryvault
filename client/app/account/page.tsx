"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken, getToken, setCurrentUser } from "@/lib/auth";
import { deleteMyAccount, getMyAccount, updateMyAccount, updateMyPassword } from "@/lib/api";
import { User } from "@/types";

const toDateInputValue = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
};

const toDisplayDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString();
};

export default function AccountPage() {
  const router = useRouter();
  const uploadsBaseUrl = process.env.NEXT_PUBLIC_UPLOADS_URL ?? "http://localhost:5000";

  const [account, setAccount] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [education, setEducation] = useState("");
  const [qualification, setQualification] = useState("");
  const [designation, setDesignation] = useState("");
  const [addressPermanent, setAddressPermanent] = useState("");
  const [addressCurrent, setAddressCurrent] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const syncAccountState = (payload: User) => {
    setAccount(payload);
    setName(payload.name || "");
    setDateOfBirth(toDateInputValue(payload.dateOfBirth));
    setEducation(payload.education || "");
    setQualification(payload.qualification || "");
    setDesignation(payload.designation || "");
    setAddressPermanent(payload.addressPermanent || "");
    setAddressCurrent(payload.addressCurrent || "");
    setPhoneNumber(payload.phoneNumber || "");
    setCurrentUser(payload);
  };

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

        syncAccountState(payload);
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
      const payload = await updateMyAccount(
        {
          name: nextName,
          dateOfBirth: dateOfBirth || null,
          education: education.trim(),
          qualification: qualification.trim(),
          designation: designation.trim(),
          addressPermanent: addressPermanent.trim(),
          addressCurrent: addressCurrent.trim(),
          phoneNumber: phoneNumber.trim()
        },
        profileImageFile
      );

      syncAccountState(payload);
      setProfileImageFile(null);
      setIsEditProfileModalOpen(false);
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
        <section className="space-y-6">
          <article className="panel">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
              <button type="button" className="button-secondary" onClick={() => setIsEditProfileModalOpen(true)}>
                Edit Profile
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
              <div>
                {account?.profileImage ? (
                  <div className="relative h-52 w-full overflow-hidden rounded-lg border border-slate-200">
                    <Image
                      src={`${uploadsBaseUrl}${account.profileImage}`}
                      alt={`${account.name} profile`}
                      fill
                      className="object-cover"
                      sizes="220px"
                    />
                  </div>
                ) : (
                  <div className="flex h-52 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500">
                    No image
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{account?.name || "-"}</h3>
                  <p className="text-sm text-slate-500">{account?.email || "-"}</p>
                </div>

                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Personal Info</h4>
                  <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold">Date of Birth:</span> {toDisplayDate(account?.dateOfBirth)}
                    </p>
                    <p>
                      <span className="font-semibold">Phone:</span> {account?.phoneNumber || "-"}
                    </p>
                    <p className="sm:col-span-2 break-words">
                      <span className="font-semibold">Permanent Address:</span> {account?.addressPermanent || "-"}
                    </p>
                    <p className="sm:col-span-2 break-words">
                      <span className="font-semibold">Current Address:</span> {account?.addressCurrent || "-"}
                    </p>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Professional Info</h4>
                  <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold">Education:</span> {account?.education || "-"}
                    </p>
                    <p>
                      <span className="font-semibold">Qualification:</span> {account?.qualification || "-"}
                    </p>
                    <p className="sm:col-span-2">
                      <span className="font-semibold">Designation:</span> {account?.designation || "-"}
                    </p>
                  </div>
                </section>
              </div>
            </div>
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
        </section>
      )}

      {isEditProfileModalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => setIsEditProfileModalOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-[700px] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 mb-4 flex items-center justify-between border-b border-slate-200 bg-white pb-3">
              <h2 className="text-xl font-semibold text-slate-900">Edit Profile</h2>
              <button type="button" className="button-secondary" onClick={() => setIsEditProfileModalOpen(false)}>
                Close
              </button>
            </div>

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
                type="date"
                placeholder="Date of birth"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
              />
              <input
                className="field"
                type="text"
                placeholder="Phone number"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
              />
              <textarea
                className="field min-h-20"
                placeholder="Permanent address"
                value={addressPermanent}
                onChange={(event) => setAddressPermanent(event.target.value)}
              />
              <textarea
                className="field min-h-20"
                placeholder="Current address"
                value={addressCurrent}
                onChange={(event) => setAddressCurrent(event.target.value)}
              />
              <input
                className="field"
                type="text"
                placeholder="Education"
                value={education}
                onChange={(event) => setEducation(event.target.value)}
              />
              <input
                className="field"
                type="text"
                placeholder="Qualification"
                value={qualification}
                onChange={(event) => setQualification(event.target.value)}
              />
              <input
                className="field"
                type="text"
                placeholder="Designation"
                value={designation}
                onChange={(event) => setDesignation(event.target.value)}
              />
              <input
                className="field"
                type="file"
                accept="image/*"
                onChange={(event) => setProfileImageFile(event.target.files?.[0] ?? null)}
              />

              <div className="flex gap-2 pt-2">
                <button type="button" className="button-secondary flex-1" onClick={() => setIsEditProfileModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button-primary flex-1" disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
