"use client";

import { ChangeEvent, FormEvent, memo, useEffect, useMemo, useState } from "react";
import DateFieldGroup, { ImportantDateItem } from "@/components/DateFieldGroup";
import { buildImportantDateRows } from "@/lib/importantDates";
import { resolveProfileImageUrl } from "@/lib/profileImageUrl";
import { Gender, Member } from "@/types";

export type MemberFormRelationType = "none" | "father" | "mother" | "spouse" | "son" | "daughter" | "brother" | "sister";

export interface MemberFormSubmitData {
  name: string;
  relationType: MemberFormRelationType;
  gender: Gender | "";
  note: string;
  importantDates: ImportantDateItem[];
  education: string;
  qualification: string;
  designation: string;
  addressPermanent: string;
  addressCurrent: string;
  imageFile: File | null;
  removeImage: boolean;
}

export interface MemberFormProps {
  initialData?: Member;
  mode: "add" | "edit";
  onSubmit: (data: MemberFormSubmitData) => void | Promise<void>;
  onCancel: () => void;
  onRemoveImage?: () => void | Promise<void>;
  removingImage?: boolean;
}

const relationOptions: { value: MemberFormRelationType; label: string }[] = [
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "spouse", label: "Spouse" },
  { value: "brother", label: "Brother" },
  { value: "sister", label: "Sister" },
  { value: "none", label: "No relation" }
];

function buildInitialState(mode: "add" | "edit", initialData?: Member): MemberFormSubmitData {
  return {
    name: initialData?.name || "",
    relationType: mode === "edit" ? "none" : "son",
    gender: initialData?.gender || "",
    note: initialData?.note || "",
    importantDates: buildImportantDateRows(initialData),
    education: initialData?.education || "",
    qualification: initialData?.qualification || "",
    designation: initialData?.designation || "",
    addressPermanent: initialData?.addressPermanent || "",
    addressCurrent: initialData?.addressCurrent || "",
    imageFile: null,
    removeImage: false
  };
}

function MemberForm({ initialData, mode, onSubmit, onCancel, onRemoveImage, removingImage = false }: MemberFormProps) {
  const [form, setForm] = useState<MemberFormSubmitData>(() => buildInitialState(mode, initialData));
  const [submitting, setSubmitting] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const initialKey = useMemo(
    () => `${mode}:${initialData?._id || "new"}:${initialData?.updatedAt || ""}`,
    [initialData?._id, initialData?.updatedAt, mode]
  );
  const existingImageUrl = useMemo(() => resolveProfileImageUrl(initialData?.profileImage), [initialData?.profileImage]);
  const displayImageUrl = form.removeImage ? localPreviewUrl : localPreviewUrl || existingImageUrl;
  const imagePreview = displayImageUrl;

  useEffect(() => {
    setForm(buildInitialState(mode, initialData));
  }, [initialKey, initialData, mode]);

  useEffect(() => {
    if (!form.imageFile) {
      setLocalPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(form.imageFile);
    setLocalPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [form.imageFile]);

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setForm((current) => ({
      ...current,
      imageFile: nextFile,
      removeImage: nextFile ? false : current.removeImage
    }));
  };

  const handleRemoveImage = () => {
    if (onRemoveImage) {
      void Promise.resolve(onRemoveImage());
      return;
    }

    setForm((current) => ({ ...current, imageFile: null, removeImage: true }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      await Promise.resolve(onSubmit(form));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-100">
          {imagePreview ? (
            <img src={imagePreview} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl text-slate-400">{form.name ? form.name.charAt(0).toUpperCase() : "?"}</span>
          )}
        </div>

        <div className="flex gap-2">
          <label className="button-secondary cursor-pointer text-xs">
            {imagePreview ? "Change Image" : "Upload Image"}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>

          {imagePreview && (
            <button
              type="button"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              onClick={handleRemoveImage}
              disabled={submitting || removingImage}
            >
              {removingImage ? "Removing..." : "Remove Image"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <input
          className="field"
          placeholder="Name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          required
        />

        <select
          className="field"
          value={form.relationType}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              relationType: event.target.value as MemberFormRelationType
            }))
          }
          disabled={mode === "edit"}
        >
          {relationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {mode === "edit" && (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Relation fields (father, mother, spouse, siblings) are managed in the Relationships tab.
          </p>
        )}

        <select
          className="field"
          value={form.gender}
          onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value as Gender | "" }))}
        >
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="unspecified">Prefer not to say</option>
        </select>

        <input
          className="field"
          type="text"
          placeholder="Education"
          value={form.education}
          onChange={(event) => setForm((current) => ({ ...current, education: event.target.value }))}
        />

        <input
          className="field"
          type="text"
          placeholder="Qualification"
          value={form.qualification}
          onChange={(event) => setForm((current) => ({ ...current, qualification: event.target.value }))}
        />

        <input
          className="field"
          type="text"
          placeholder="Designation"
          value={form.designation}
          onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))}
        />

        <textarea
          className="field min-h-20"
          placeholder="Permanent address"
          value={form.addressPermanent}
          onChange={(event) => setForm((current) => ({ ...current, addressPermanent: event.target.value }))}
        />

        <textarea
          className="field min-h-20"
          placeholder="Current address"
          value={form.addressCurrent}
          onChange={(event) => setForm((current) => ({ ...current, addressCurrent: event.target.value }))}
        />

        <DateFieldGroup
          importantDates={form.importantDates}
          onChange={(importantDates) => setForm((current) => ({ ...current, importantDates }))}
        />

        <textarea
          className="field min-h-20"
          placeholder="Optional note"
          value={form.note}
          onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" className="button-secondary flex-1" onClick={onCancel} disabled={submitting || removingImage}>
          Cancel
        </button>
        <button
          type="submit"
          className="button-primary flex-1 flex items-center justify-center gap-2"
          disabled={submitting || removingImage}
        >
          {submitting && (
            <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          )}
          {submitting ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

export default memo(MemberForm);
