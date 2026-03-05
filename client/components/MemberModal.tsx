"use client";

import { FormEvent, memo, useMemo } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/provider";
import MemberForm, { MemberFormSubmitData } from "@/components/MemberForm";
import { resolveMemberImportantDates } from "@/lib/importantDates";
import { resolveProfileImageUrl } from "@/lib/profileImageUrl";
import { resolveRelation } from "@/utils/relationResolver";
import {
  Member,
  MemberWithRelationsResponse,
  RelationMutationAction,
  RelationMutationType,
  RemoveRelationType
} from "@/types";

type DetailModalView = "edit" | "relations" | "delete";

type RelationMutationOption = {
  value: RelationMutationType;
  labelKey: string;
};

function formatDate(value?: string | null): string {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleDateString();
}

export interface MemberModalProps {
  member: Member | null;
  mode: "view" | "edit";
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSave: (updatedMember: Member) => void;
}

type MemberModalInternalProps = MemberModalProps & {
  loadingDetail: boolean;
  detailBundle: MemberWithRelationsResponse | null;
  detailModalView: DetailModalView;
  setDetailModalView: (view: DetailModalView) => void;
  detailCanEdit: boolean;
  canDeleteDetailMember: boolean;
  detailHasChildren: boolean;
  focusedMember: Member | null;
  treeData: Member[];
  deletingDetail: boolean;
  removingRelationKey: string | null;
  relationAction: RelationMutationAction;
  onRelationActionChange: (value: RelationMutationAction) => void;
  relationType: RelationMutationType;
  onRelationTypeChange: (value: RelationMutationType) => void;
  relationParentRole: "father" | "mother" | "auto";
  onRelationParentRoleChange: (value: "father" | "mother" | "auto") => void;
  relationTargetMemberId: string;
  onRelationTargetMemberIdChange: (value: string) => void;
  relationMemberSearch: string;
  onRelationMemberSearchChange: (value: string) => void;
  relationMemberOptions: Member[];
  loadingRelationMembers: boolean;
  relationSubmitting: boolean;
  relationMutationOptions: RelationMutationOption[];
  onSubmitMemberDetails: (data: MemberFormSubmitData) => Promise<boolean> | boolean;
  onRemoveMemberImage: () => Promise<void> | void;
  removingMemberImage: boolean;
  onApplyRelationMutation: (event: FormEvent<HTMLFormElement>) => Promise<void> | void;
  onRemoveRelationship: (
    relationType: RemoveRelationType,
    relatedMemberId: string,
    relatedMemberName: string
  ) => Promise<void> | void;
  onRemoveMember: (shouldDeleteSubtree: boolean) => Promise<void> | void;
  onSetFocusPerson: (memberId: string) => void;
};

function MemberModal(props: MemberModalInternalProps) {
  const { t } = useI18n();
  const {
    member,
    mode,
    isOpen,
    onClose,
    onEdit,
    onSave,
    loadingDetail,
    detailBundle,
    detailModalView,
    setDetailModalView,
    detailCanEdit,
    canDeleteDetailMember,
    detailHasChildren,
    focusedMember,
    treeData,
    deletingDetail,
    removingRelationKey,
    relationAction,
    onRelationActionChange,
    relationType,
    onRelationTypeChange,
    relationParentRole,
    onRelationParentRoleChange,
    relationTargetMemberId,
    onRelationTargetMemberIdChange,
    relationMemberSearch,
    onRelationMemberSearchChange,
    relationMemberOptions,
    loadingRelationMembers,
    relationSubmitting,
    relationMutationOptions,
    onSubmitMemberDetails,
    onRemoveMemberImage,
    removingMemberImage,
    onApplyRelationMutation,
    onRemoveRelationship,
    onRemoveMember,
    onSetFocusPerson
  } = props;

  const importantDateSummary = useMemo(() => {
    const normalizedImportantDates = detailBundle ? resolveMemberImportantDates(detailBundle.focus) : [];
    return {
      dateOfBirthEntry: normalizedImportantDates.find((item) => item.type === "dob"),
      anniversaryEntry: normalizedImportantDates.find((item) => item.type === "anniversary"),
      deathEntry: normalizedImportantDates.find((item) => item.type === "death"),
      customDateEntries: normalizedImportantDates.filter((item) => item.type === "custom")
    };
  }, [detailBundle]);
  const detailRelationLabel = useMemo(() => {
    if (!detailBundle?.focus || !focusedMember) {
      return "Relative";
    }

    return resolveRelation(detailBundle.focus, focusedMember, treeData);
  }, [detailBundle, focusedMember, treeData]);
  const focusProfileImageUrl = detailBundle ? resolveProfileImageUrl(detailBundle.focus.profileImage) : null;

  if (!isOpen || !member) {
    return null;
  }

  const switchToViewMode = () => {
    onSave(detailBundle?.focus || member);
  };

  const submitMemberDetails = async (data: MemberFormSubmitData) => {
    const isSaved = await onSubmitMemberDetails(data);
    if (isSaved) {
      onSave(detailBundle?.focus || member);
      onClose();
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="relative bg-white w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl shadow-xl z-50 p-6"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
      >
        <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-4 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <h2 className="text-xl font-semibold text-slate-900">Member Details</h2>
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {loadingDetail || !detailBundle ? (
          <p className="text-sm text-slate-600">Loading member details for {member.name}...</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <aside className="space-y-3">
              <button
                type="button"
                className="button-secondary w-full"
                onClick={() => {
                  onSetFocusPerson(detailBundle.focus._id);
                  onClose();
                }}
              >
                Set As Focus
              </button>

              <p className="text-xs text-slate-500">ID: {detailBundle.focus._id}</p>
            </aside>

            <section className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    detailModalView === "edit"
                      ? "bg-brand-500 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => {
                    setDetailModalView("edit");
                    onEdit();
                  }}
                >
                  Edit Member
                </button>
                {detailCanEdit && (
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      detailModalView === "relations"
                        ? "bg-brand-500 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    onClick={() => {
                      switchToViewMode();
                      setDetailModalView("relations");
                    }}
                  >
                    Remove Relationship
                  </button>
                )}
                {canDeleteDetailMember && (
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      detailModalView === "delete"
                        ? "bg-red-600 text-white"
                        : "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
                    onClick={() => {
                      switchToViewMode();
                      setDetailModalView("delete");
                    }}
                  >
                    Delete Member
                  </button>
                )}
              </div>

              {detailModalView === "edit" && (
                <>
                  {mode === "edit" ? (
                    <MemberForm
                      initialData={detailBundle.focus}
                      mode="edit"
                      onSubmit={submitMemberDetails}
                      onCancel={switchToViewMode}
                      onRemoveImage={onRemoveMemberImage}
                      removingImage={removingMemberImage}
                    />
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
                          {focusProfileImageUrl ? (
                            <div className="relative h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-white">
                              <img
                                src={focusProfileImageUrl}
                                alt={`${detailBundle.focus.name} profile`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                              No image
                            </div>
                          )}

                          <div className="min-w-0">
                            <h3 className="truncate text-3xl font-bold text-slate-900">{detailBundle.focus.name}</h3>
                            <p className="mt-1 text-sm text-slate-500">{detailRelationLabel}</p>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm text-slate-700">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Personal Information</h4>
                          <p>
                            <span className="font-semibold">Gender:</span> {detailBundle.focus.gender || "unspecified"}
                          </p>
                          <p>
                            <span className="font-semibold">Personal Note:</span> {detailBundle.focus.note || "-"}
                          </p>
                        </div>

                        <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
                          <div className="space-y-2 text-sm text-slate-700">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Important Dates</h4>
                            <p>
                              <span className="font-semibold">Date of Birth:</span>{" "}
                              {importantDateSummary.dateOfBirthEntry ? formatDate(importantDateSummary.dateOfBirthEntry.value) : "-"}
                            </p>
                            <p>
                              <span className="font-semibold">Anniversary:</span>{" "}
                              {importantDateSummary.anniversaryEntry ? formatDate(importantDateSummary.anniversaryEntry.value) : "-"}
                            </p>
                            <p>
                              <span className="font-semibold">Date of Death:</span>{" "}
                              {importantDateSummary.deathEntry ? formatDate(importantDateSummary.deathEntry.value) : "-"}
                            </p>
                            <div>
                              <span className="font-semibold">Custom Dates:</span>
                              {importantDateSummary.customDateEntries.length ? (
                                <div className="mt-1 space-y-1">
                                  {importantDateSummary.customDateEntries.map((entry, index) => (
                                    <p key={`${entry.label || "custom"}-${entry.value}-${index}`}>
                                      {(entry.label || "Custom").trim()}: {formatDate(entry.value)}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <span> -</span>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2 text-sm text-slate-700">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Addresses</h4>
                            <p>
                              <span className="font-semibold">Permanent:</span> {detailBundle.focus.addressPermanent || "-"}
                            </p>
                            <p>
                              <span className="font-semibold">Current:</span> {detailBundle.focus.addressCurrent || "-"}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-700">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Professional Information</h4>
                          <p>
                            <span className="font-semibold">Education:</span> {detailBundle.focus.education || "-"}
                          </p>
                          <p>
                            <span className="font-semibold">Qualification:</span> {detailBundle.focus.qualification || "-"}
                          </p>
                          <p>
                            <span className="font-semibold">Designation:</span> {detailBundle.focus.designation || "-"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        {detailCanEdit ? (
                          <button type="button" className="button-primary w-full" onClick={onEdit}>
                            Edit
                          </button>
                        ) : (
                          <p className="text-xs text-slate-600">Read-only access. Only tree owner/admin can update members.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {detailModalView === "relations" && (
                <div className="space-y-4">
                  {!detailCanEdit ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Read-only access. Only tree owner/admin can modify relationships.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                        <h3 className="text-sm font-semibold text-slate-900">Relationships</h3>
                        <p className="text-xs text-slate-500">Remove incorrect links from this member.</p>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parents</p>
                          {detailBundle.relations.father || detailBundle.relations.mother ? (
                            <>
                              {detailBundle.relations.father && (
                                <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                                  <span>{detailBundle.relations.father.name}</span>
                                  <button
                                    type="button"
                                    className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                    onClick={() =>
                                      void onRemoveRelationship(
                                        "parent",
                                        detailBundle.relations.father!._id,
                                        detailBundle.relations.father!.name
                                      )
                                    }
                                    disabled={removingRelationKey === `parent:${detailBundle.relations.father._id}`}
                                  >
                                    {removingRelationKey === `parent:${detailBundle.relations.father._id}` ? "Removing..." : "Remove"}
                                  </button>
                                </div>
                              )}
                              {detailBundle.relations.mother && (
                                <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                                  <span>{detailBundle.relations.mother.name}</span>
                                  <button
                                    type="button"
                                    className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                    onClick={() =>
                                      void onRemoveRelationship(
                                        "parent",
                                        detailBundle.relations.mother!._id,
                                        detailBundle.relations.mother!.name
                                      )
                                    }
                                    disabled={removingRelationKey === `parent:${detailBundle.relations.mother._id}`}
                                  >
                                    {removingRelationKey === `parent:${detailBundle.relations.mother._id}` ? "Removing..." : "Remove"}
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                              No parent relationships.
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Spouses</p>
                          {detailBundle.relations.spouses.length > 0 ? (
                            detailBundle.relations.spouses.map((member) => (
                              <div
                                key={`spouse-${member._id}`}
                                className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
                              >
                                <span>{member.name}</span>
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                  onClick={() => void onRemoveRelationship("spouse", member._id, member.name)}
                                  disabled={removingRelationKey === `spouse:${member._id}`}
                                >
                                  {removingRelationKey === `spouse:${member._id}` ? "Removing..." : "Remove"}
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                              No spouse relationships.
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Siblings</p>
                          {detailBundle.relations.siblings.length > 0 ? (
                            detailBundle.relations.siblings.map((member) => (
                              <div
                                key={`sibling-${member._id}`}
                                className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
                              >
                                <span>{member.name}</span>
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                  onClick={() => void onRemoveRelationship("sibling", member._id, member.name)}
                                  disabled={removingRelationKey === `sibling:${member._id}`}
                                >
                                  {removingRelationKey === `sibling:${member._id}` ? "Removing..." : "Remove"}
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                              No sibling relationships.
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Children</p>
                          {detailBundle.relations.children.length > 0 ? (
                            detailBundle.relations.children.map((member) => (
                              <div
                                key={`child-${member._id}`}
                                className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
                              >
                                <span>{member.name}</span>
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                  onClick={() => void onRemoveRelationship("child", member._id, member.name)}
                                  disabled={removingRelationKey === `child:${member._id}`}
                                >
                                  {removingRelationKey === `child:${member._id}` ? "Removing..." : "Remove"}
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                              No child relationships.
                            </p>
                          )}
                        </div>
                      </div>

                      <form onSubmit={onApplyRelationMutation} className="space-y-3 rounded-lg border border-slate-200 p-3">
                        <h3 className="text-sm font-semibold text-slate-900">Relation Engine</h3>
                        <p className="text-xs text-slate-500">
                          Manage direct relationship links from <span className="font-semibold">{detailBundle.focus.name}</span>.
                        </p>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            className="field"
                            value={relationAction}
                            onChange={(event) => onRelationActionChange(event.target.value as RelationMutationAction)}
                          >
                            <option value="connect">Connect</option>
                            <option value="disconnect">Disconnect</option>
                          </select>

                          <select
                            className="field"
                            value={relationType}
                            onChange={(event) => onRelationTypeChange(event.target.value as RelationMutationType)}
                          >
                            {relationMutationOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {t(option.labelKey)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {relationType === "child" && (
                          <select
                            className="field"
                            value={relationParentRole}
                            onChange={(event) => onRelationParentRoleChange(event.target.value as "father" | "mother" | "auto")}
                          >
                            <option value="auto">Parent role: Auto</option>
                            <option value="father">Parent role: Father</option>
                            <option value="mother">Parent role: Mother</option>
                          </select>
                        )}

                        <input
                          className="field"
                          placeholder="Search members by name"
                          value={relationMemberSearch}
                          onChange={(event) => onRelationMemberSearchChange(event.target.value)}
                        />

                        <select
                          className="field"
                          value={relationTargetMemberId}
                          onChange={(event) => onRelationTargetMemberIdChange(event.target.value)}
                          required
                        >
                          <option value="">{loadingRelationMembers ? "Loading members..." : "Select target member"}</option>
                          {relationMemberOptions.map((member) => (
                            <option key={member._id} value={member._id}>
                              {member.name}
                            </option>
                          ))}
                        </select>

                        <button type="submit" className="button-secondary w-full" disabled={relationSubmitting}>
                          {relationSubmitting ? "Applying relation..." : "Apply Relation Update"}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              )}

              {detailModalView === "delete" && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  {canDeleteDetailMember ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-red-800">Delete Member</p>
                      {detailHasChildren ? (
                        <>
                          <p className="text-xs text-red-700">This member has children. Choose what to delete.</p>
                          <button
                            type="button"
                            className="w-full rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                            onClick={() => void onRemoveMember(false)}
                            disabled={deletingDetail}
                          >
                            {deletingDetail ? "Deleting..." : "Delete only this member"}
                          </button>
                          <p className="text-xs text-red-700">Children will be relinked to available parent when possible.</p>
                          <button
                            type="button"
                            className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                            onClick={() => void onRemoveMember(true)}
                            disabled={deletingDetail}
                          >
                            {deletingDetail ? "Deleting..." : "Delete entire subtree"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                          onClick={() => void onRemoveMember(false)}
                          disabled={deletingDetail}
                        >
                          {deletingDetail ? "Deleting..." : "Delete Member"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-red-700">
                      {detailBundle.focus.isRoot
                        ? "Root member cannot be deleted."
                        : "Read-only access. Only tree owner/admin can delete members."}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default memo(MemberModal);
