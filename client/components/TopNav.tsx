"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearToken, getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/provider";
import { getMyTrees, getNotifications, markNotificationAsRead } from "@/lib/api";
import { NotificationItem } from "@/types";

const treePasswordPrefix = "memoryvault_tree_password_";
const treeAccessTokenPrefix = "memoryvault_tree_access_token_";

function clearTreeSessionAccess(): void {
  if (typeof window === "undefined") {
    return;
  }

  const keysToDelete: string[] = [];

  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (!key) {
      continue;
    }

    if (key.startsWith(treePasswordPrefix) || key.startsWith(treeAccessTokenPrefix)) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    window.sessionStorage.removeItem(key);
  }
}

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [routingMyTree, setRoutingMyTree] = useState(false);

  useEffect(() => {
    setIsAuthenticated(Boolean(getToken()));
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    let active = true;
    const load = async () => {
      try {
        setLoadingNotifications(true);
        const payload = await getNotifications(1, 8);
        if (!active) {
          return;
        }

        setNotifications(payload.notifications);
        setUnreadCount(payload.unread);
      } catch (_error) {
        if (active) {
          setNotifications([]);
          setUnreadCount(0);
        }
      } finally {
        if (active) {
          setLoadingNotifications(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [isAuthenticated, pathname]);

  const isAuthScreen = useMemo(() => pathname === "/login" || pathname === "/register", [pathname]);
  const isDashboardPath = pathname === "/" || pathname === "/dashboard";

  const handleMyTreesNavigation = useCallback(async () => {
    try {
      setRoutingMyTree(true);
      const trees = await getMyTrees();

      if (trees.length === 1) {
        router.push(`/tree/${trees[0]._id}`);
        return;
      }

      router.push("/dashboard#my-trees");
    } catch (_error) {
      router.push("/dashboard#my-trees");
    } finally {
      setRoutingMyTree(false);
    }
  }, [router]);

  if (!isAuthenticated || isAuthScreen) {
    return null;
  }

  const handleLogout = () => {
    clearTreeSessionAccess();
    clearToken();
    router.push("/login");
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      const payload = await markNotificationAsRead(notificationId);
      setUnreadCount(payload.unread);
      setNotifications((current) =>
        current.map((notification) =>
          notification._id === notificationId ? { ...notification, isRead: true } : notification
        )
      );
    } catch (_error) {
      // ignore notification mark-read failures in navbar UI
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-slate-900">
          {t("common.appName")}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              isDashboardPath ? "bg-brand-500 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t("nav.dashboard")}
          </Link>
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={() => void handleMyTreesNavigation()}
            disabled={routingMyTree}
          >
            {routingMyTree ? "Loading..." : t("nav.myTrees")}
          </button>
          <Link
            href="/pricing"
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              pathname === "/pricing" ? "bg-brand-500 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t("nav.pricing")}
          </Link>
          <Link
            href="/account"
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              pathname === "/account" ? "bg-brand-500 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Account
          </Link>
          <div className="relative">
            <button
              type="button"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
              onClick={() => setNotificationMenuOpen((current) => !current)}
              aria-label="Notifications"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 8a6 6 0 1 1 12 0v5l1.5 2H4.5L6 13V8z" />
                <path d="M10 18a2 2 0 0 0 4 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            {notificationMenuOpen && (
              <div className="absolute right-0 z-[90] mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="mb-2 px-2 text-xs font-semibold text-slate-500">Notifications</div>
                {loadingNotifications ? (
                  <p className="px-2 py-3 text-sm text-slate-500">Loading...</p>
                ) : notifications.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-slate-500">No notifications.</p>
                ) : (
                  <ul className="max-h-80 space-y-1 overflow-auto">
                    {notifications.map((notification) => (
                      <li key={notification._id} className="rounded-lg border border-slate-100 p-2">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => {
                            if (!notification.isRead) {
                              void handleMarkRead(notification._id);
                            }
                          }}
                        >
                          <p className={`text-sm ${notification.isRead ? "text-slate-600" : "font-semibold text-slate-900"}`}>
                            {notification.message}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
            <span>{t("nav.language")}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as "en" | "hi")}
              className="bg-transparent text-xs outline-none"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
          <button type="button" onClick={handleLogout} className="button-secondary px-3 py-2 text-sm">
            {t("nav.logout")}
          </button>
        </div>
      </div>
    </nav>
  );
}

