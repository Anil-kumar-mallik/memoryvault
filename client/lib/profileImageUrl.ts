"use client";

export function resolveProfileImageUrl(profileImage?: string | null): string | null {
  const value = String(profileImage || "").trim();
  if (!value) {
    return null;
  }

  const uploadsBaseUrl = process.env.NEXT_PUBLIC_UPLOADS_URL;
  if (!value.startsWith("http") && !uploadsBaseUrl) {
    return null;
  }

  const imageUrl = value.startsWith("http")
    ? value
    : `${uploadsBaseUrl}${value}`;

  return imageUrl;
}
