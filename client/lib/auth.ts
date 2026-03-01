import { User } from "@/types";

const TOKEN_KEY = "memoryvault_token";
const USER_KEY = "memoryvault_user";
const CSRF_KEY = "memoryvault_csrf_token";

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
}

export function setCurrentUser(user: User): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getCsrfToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(CSRF_KEY);
}

export function setCsrfToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CSRF_KEY, token);
}

export function getCurrentUser(): User | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch (_error) {
    return null;
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem("token");
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(CSRF_KEY);
}
