"use client";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiV1BaseUrl(): string | null {
  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (!apiUrl) {
    return null;
  }

  const normalized = trimTrailingSlashes(apiUrl);
  if (normalized.endsWith("/v1")) {
    return normalized;
  }

  return `${normalized}/v1`;
}

function resolveUploadsBaseUrl(apiV1BaseUrl: string | null): string | null {
  const uploadsUrl = String(process.env.NEXT_PUBLIC_UPLOADS_URL || "").trim();
  if (uploadsUrl) {
    return trimTrailingSlashes(uploadsUrl);
  }

  if (!apiV1BaseUrl) {
    return null;
  }

  return apiV1BaseUrl.replace(/\/api\/v1$/i, "").replace(/\/api$/i, "");
}

export function resolveProfileImageUrl(profileImage?: string | null): string | null {
  const value = String(profileImage || "").trim();
  if (!value) {
    return null;
  }

  if (value.startsWith("http")) {
    return value;
  }

  const apiV1BaseUrl = resolveApiV1BaseUrl();
  if (OBJECT_ID_PATTERN.test(value)) {
    if (!apiV1BaseUrl) {
      return null;
    }

    return `${apiV1BaseUrl}/image/${value}`;
  }

  if (value.startsWith("/api/")) {
    if (!apiV1BaseUrl) {
      return null;
    }

    const origin = apiV1BaseUrl.replace(/\/api\/v1$/i, "").replace(/\/api$/i, "");
    return `${origin}${value}`;
  }

  if (value.startsWith("/uploads/")) {
    const uploadsBaseUrl = resolveUploadsBaseUrl(apiV1BaseUrl);
    if (!uploadsBaseUrl) {
      return null;
    }

    return `${uploadsBaseUrl}${value}`;
  }

  return value;
}
