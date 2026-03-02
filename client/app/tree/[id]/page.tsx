"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TreeCanvas from "@/components/TreeCanvas";
import DateFieldGroup, { ImportantDateItem, ImportantDateType, createImportantDateRow } from "@/components/DateFieldGroup";
import {
  clearTreeAccessPassword,
  clearTreeAccessToken,
  createMember,
  deleteMember,
  getMySubscription,
  getTreeFocus,
  getMembers,
  getMemberWithRelations,
  getTreeById,
  searchMembers,
  setTreeAccessPassword,
  removeMemberRelation,
  updateMemberRelation,
  updateMember
} from "@/lib/api";
import { getCurrentUser, getToken } from "@/lib/auth";
import {
  AddMemberPayload,
  Gender,
  Member,
  MemberWithRelationsResponse,
  RelationMutationAction,
  RelationMutationType,
  RelationType,
  RemoveRelationType,
  SubscriptionSummaryResponse,
  TreeFocusResponse,
  TreeDetails
} from "@/types";
import { useI18n } from "@/lib/i18n/provider";

type AddRelationOption = "none" | "father" | "mother" | "spouse" | "son" | "daughter" | "brother" | "sister";

const relationOptions: { value: AddRelationOption; labelKey: string }[] = [
  { value: "father", labelKey: "tree.father" },
  { value: "mother", labelKey: "tree.mother" },
  { value: "spouse", labelKey: "tree.spouse" },
  { value: "son", labelKey: "tree.son" },
  { value: "daughter", labelKey: "tree.daughter" },
  { value: "brother", labelKey: "tree.brother" },
  { value: "sister", labelKey: "tree.sister" }
];

const relationMutationOptions: { value: RelationMutationType; labelKey: string }[] = [
  { value: "father", labelKey: "tree.father" },
  { value: "mother", labelKey: "tree.mother" },
  { value: "child", labelKey: "tree.child" },
  { value: "spouse", labelKey: "tree.spouse" },
  { value: "sibling", labelKey: "tree.sibling" }
];

type AddFormState = {
  name: string;
  relationType: AddRelationOption;
  gender: Gender | "";
  note: string;
  importantDates: ImportantDateItem[];
  education: string;
  qualification: string;
  designation: string;
  addressPermanent: string;
  addressCurrent: string;
};

type DetailModalView = "edit" | "relations" | "delete";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
};

const TOAST_TIMEOUT_MS = 3600;
const EXPORT_PAGE_SIZE = 100;
const VIRTUAL_ROW_HEIGHT = 34;
const VIRTUAL_VIEWPORT_HEIGHT = 204;

const initialAddForm: AddFormState = {
  name: "",
  relationType: "son",
  gender: "",
  note: "",
  importantDates: [createImportantDateRow(1)],
  education: "",
  qualification: "",
  designation: "",
  addressPermanent: "",
  addressCurrent: ""
};

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

function oppositeGender(gender?: Gender): Gender | "" {
  if (gender === "male") {
    return "female";
  }

  if (gender === "female") {
    return "male";
  }

  return "";
}

function resolveAddRelation(relation: AddRelationOption): { relationType: RelationType } {
  switch (relation) {
    case "father":
      return { relationType: "father" };
    case "mother":
      return { relationType: "mother" };
    case "spouse":
      return { relationType: "spouse" };
    case "son":
      return { relationType: "child" };
    case "daughter":
      return { relationType: "child" };
    case "brother":
      return { relationType: "sibling" };
    case "sister":
      return { relationType: "sibling" };
    case "none":
    default:
      return { relationType: "none" };
  }
}

function autoGenderForRelation(
  relationType: AddRelationOption,
  focusedGender?: Gender
): Gender | "" {
  if (relationType === "father" || relationType === "brother" || relationType === "son") {
    return "male";
  }

  if (relationType === "mother" || relationType === "sister" || relationType === "daughter") {
    return "female";
  }

  if (relationType === "spouse") {
    return oppositeGender(focusedGender);
  }

  return "";
}

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

function mapImportantDatesToLegacyFields(entries: ImportantDateItem[]): {
  dateOfBirth: string | null;
  anniversaryDate: string | null;
  dateOfDeath: string | null;
  importantDates: Array<{ type: string; value: string; label?: string }>;
  customDateNotes: string[];
} {
  const normalized = entries
    .filter((entry) => entry.type && entry.value)
    .map((entry) => ({
      type: entry.type,
      value: entry.value,
      label: entry.customLabel.trim()
    }));

  const getFirstByType = (type: ImportantDateType) => normalized.find((entry) => entry.type === type)?.value || null;
  const customDateNotes = normalized
    .filter((entry) => entry.type === "custom")
    .map((entry) => `${entry.label || "Custom"}: ${entry.value}`);

  return {
    dateOfBirth: getFirstByType("dob"),
    anniversaryDate: getFirstByType("anniversary"),
    dateOfDeath: getFirstByType("death"),
    importantDates: normalized.map((entry) => ({
      type: entry.type,
      value: entry.value,
      ...(entry.label ? { label: entry.label } : {})
    })),
    customDateNotes
  };
}

function resolveRelationToCurrentFocus(member: Member | null, focusBundle: MemberWithRelationsResponse | null): string {
  if (!member || !focusBundle) {
    return "Family Member";
  }

  if (member._id === focusBundle.focus._id) {
    return "Self";
  }

  if (focusBundle.relations.father?._id === member._id) {
    return "Father";
  }

  if (focusBundle.relations.mother?._id === member._id) {
    return "Mother";
  }

  if (focusBundle.relations.spouses.some((item) => item._id === member._id)) {
    return "Spouse";
  }

  if (focusBundle.relations.children.some((item) => item._id === member._id)) {
    if (member.gender === "male") {
      return "Son";
    }
    if (member.gender === "female") {
      return "Daughter";
    }
    return "Child";
  }

  if (focusBundle.relations.siblings.some((item) => item._id === member._id)) {
    if (member.gender === "male") {
      return "Brother";
    }
    if (member.gender === "female") {
      return "Sister";
    }
    return "Sibling";
  }

  return "Family Member";
}

function createDownload(fileName: string, content: Blob): void {
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(content);
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function escapePdfText(rawValue: string): string {
  return rawValue
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function buildSimplePdfDocument(title: string, lines: string[]): Blob {
  const linesPerPage = 48;
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    chunks.push(lines.slice(index, index + linesPerPage));
  }

  if (chunks.length === 0) {
    chunks.push(["No members available."]);
  }

  const pageStreams = chunks.map((chunk, chunkIndex) => {
    const commands: string[] = [];
    let y = 805;

    if (chunkIndex === 0) {
      commands.push(`BT /F1 16 Tf 50 ${y} Td (${escapePdfText(title)}) Tj ET`);
      y -= 28;
    }

    for (const line of chunk) {
      commands.push(`BT /F1 10 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`);
      y -= 15;
    }

    return commands.join("\n");
  });

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

  const kids: string[] = [];
  let nextObjectNumber = 3;
  const fontObjectNumber = 3 + pageStreams.length * 2;

  for (const stream of pageStreams) {
    const pageObjectNumber = nextObjectNumber;
    const contentObjectNumber = nextObjectNumber + 1;
    nextObjectNumber += 2;

    kids.push(`${pageObjectNumber} 0 R`);
    objects[pageObjectNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  objects[fontObjectNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];
  const maxObjectNumber = fontObjectNumber;

  for (let objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber += 1) {
    const body = objects[objectNumber];
    offsets[objectNumber] = output.length;
    output += `${objectNumber} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = output.length;
  output += `xref\n0 ${maxObjectNumber + 1}\n`;
  output += "0000000000 65535 f \n";

  for (let objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber += 1) {
    output += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${maxObjectNumber + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([output], { type: "application/pdf" });
}

function VirtualizedMemberList({ members }: { members: Member[] }) {
  const [scrollTop, setScrollTop] = useState(0);
  const totalHeight = members.length * VIRTUAL_ROW_HEIGHT;
  const overscan = 6;
  const startIndex = Math.max(Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - overscan, 0);
  const visibleCount = Math.ceil(VIRTUAL_VIEWPORT_HEIGHT / VIRTUAL_ROW_HEIGHT) + overscan * 2;
  const endIndex = Math.min(startIndex + visibleCount, members.length);
  const visibleMembers = members.slice(startIndex, endIndex);
  const translateY = startIndex * VIRTUAL_ROW_HEIGHT;

  if (!members.length) {
    return <p className="text-xs text-slate-500">No children linked.</p>;
  }

  return (
    <div
      className="overflow-y-auto rounded-lg border border-slate-200 bg-white"
      style={{ height: `${VIRTUAL_VIEWPORT_HEIGHT}px` }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: `${totalHeight}px` }}>
        <div style={{ transform: `translateY(${translateY}px)` }}>
          {visibleMembers.map((member) => (
            <div
              key={member._id}
              className="flex items-center justify-between border-b border-slate-100 px-3 text-xs text-slate-700 last:border-b-0"
              style={{ height: `${VIRTUAL_ROW_HEIGHT}px` }}
            >
              <span className="truncate">{member.name}</span>
              <span className="ml-3 text-[10px] text-slate-400">{member._id.slice(-6)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TreePage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const treeId = useMemo(() => {
    const raw = params.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.id]);

  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [tree, setTree] = useState<TreeDetails | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusBundle, setFocusBundle] = useState<MemberWithRelationsResponse | null>(null);

  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingFocus, setLoadingFocus] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummaryResponse | null>(null);

  const [requiresPassword, setRequiresPassword] = useState(false);
  const [treePasswordInput, setTreePasswordInput] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(initialAddForm);
  const [addImageFile, setAddImageFile] = useState<File | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Member | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailBundle, setDetailBundle] = useState<MemberWithRelationsResponse | null>(null);
  const [detailName, setDetailName] = useState("");
  const [detailNote, setDetailNote] = useState("");
  const [detailImageFile, setDetailImageFile] = useState<File | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [deletingDetail, setDeletingDetail] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [detailModalView, setDetailModalView] = useState<DetailModalView>("edit");
  const [removingRelationKey, setRemovingRelationKey] = useState<string | null>(null);
  const [relationAction, setRelationAction] = useState<RelationMutationAction>("connect");
  const [relationType, setRelationType] = useState<RelationMutationType>("spouse");
  const [relationParentRole, setRelationParentRole] = useState<"father" | "mother" | "auto">("auto");
  const [relationTargetMemberId, setRelationTargetMemberId] = useState("");
  const [relationSubmitting, setRelationSubmitting] = useState(false);
  const [relationMemberSearch, setRelationMemberSearch] = useState("");
  const [relationMemberOptions, setRelationMemberOptions] = useState<Member[]>([]);
  const [loadingRelationMembers, setLoadingRelationMembers] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const uploadsBaseUrl = process.env.NEXT_PUBLIC_UPLOADS_URL ?? "http://localhost:5000";
  const memberLimitReached = Boolean(subscription?.usage.memberLimitReached);
  const memberLimitMessage =
    subscription?.plan?.name?.toLowerCase() === "free" && subscription?.usage.maxMembers === 10
      ? "Free plan allows only 10 members. Upgrade to continue."
      : "Member limit reached for current plan.";
  const canEditMyProfile = Boolean(
    focusBundle?.focus.isRoot &&
      focusBundle?.focus.linkedUserId &&
      currentUserId &&
      String(focusBundle.focus.linkedUserId) === String(currentUserId)
  );

  const isPasswordError = (message: string) => {
    const normalized = message.toLowerCase();
    return normalized.includes("password") || normalized.includes("private");
  };

  const isMemberNotFoundError = useCallback((message: string) => {
    const normalized = message.toLowerCase();
    return normalized.includes("member not found") || normalized.includes("status 404");
  }, []);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 100000);
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_TIMEOUT_MS);
  }, []);

  const fetchMembersForExport = useCallback(async () => {
    const allMembers: Member[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const payload = await getMembers(treeId, page, EXPORT_PAGE_SIZE);
      allMembers.push(...payload.members);
      hasMore = payload.hasMore;
      page += 1;
    }

    return allMembers;
  }, [treeId]);

  const exportTreeAsPdf = useCallback(async () => {
    if (!tree) {
      return;
    }

    try {
      setExporting("pdf");
      const members = await fetchMembersForExport();
      const memberMap = new Map(members.map((member) => [member._id, member]));
      const lines = members.map((member, index) => {
        const fatherName = member.fatherId ? memberMap.get(member.fatherId)?.name || member.fatherId.slice(-6) : "N/A";
        const motherName = member.motherId ? memberMap.get(member.motherId)?.name || member.motherId.slice(-6) : "N/A";
        return `${index + 1}. ${member.name} | father: ${fatherName} | mother: ${motherName} | spouses: ${member.spouses.length} | children: ${member.children.length}`;
      });

      const headerLine = [
        `Exported: ${new Date().toISOString()}`,
        `Tree: ${tree.name}`,
        `Privacy: ${tree.privacy}`,
        `Members: ${members.length}`,
        ""
      ];
      const pdfBlob = buildSimplePdfDocument(`MemoryVault Tree Export`, [...headerLine, ...lines]);
      createDownload(`memoryvault-${treeId}.pdf`, pdfBlob);
      showToast("Tree exported to PDF.", "success");
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : "Failed to export tree PDF.";
      setError(message);
      showToast(message, "error");
    } finally {
      setExporting(null);
    }
  }, [fetchMembersForExport, showToast, tree, treeId]);

  const buildPublicShareUrl = useCallback(() => {
    if (!tree?.slug || typeof window === "undefined") {
      return null;
    }

    return `${window.location.origin}/tree/public/${tree.slug}`;
  }, [tree?.slug]);

  const copyShareLink = useCallback(async () => {
    const shareUrl = buildPublicShareUrl();
    if (!shareUrl) {
      showToast("Public share URL is not available yet.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Share link copied.", "success");
    } catch (_error) {
      showToast("Failed to copy share link.", "error");
    }
  }, [buildPublicShareUrl, showToast]);

  const loadSubscription = useCallback(async () => {
    try {
      setLoadingSubscription(true);
      const payload = await getMySubscription();
      setSubscription(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load subscription.");
    } finally {
      setLoadingSubscription(false);
    }
  }, []);

  const loadTree = useCallback(
    async (candidatePassword?: string) => {
      try {
        setLoadingTree(true);
        const payload = await getTreeById(treeId, candidatePassword);
        setTree(payload);
        // Always start from tree root focus on load to avoid stale/random focus restoration.
        setFocusId(payload.rootMemberId || payload.rootMember || payload.initialFocusMember || null);

        if (candidatePassword) {
          setTreeAccessPassword(treeId, candidatePassword);
        }

        setRequiresPassword(false);
        setPasswordError(null);
        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load tree.";

        if (isPasswordError(message)) {
          clearTreeAccessPassword(treeId);
          clearTreeAccessToken(treeId);
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
    [treeId]
  );

  const loadFocusBundle = useCallback(
    async (targetFocusId: string) => {
      try {
        setLoadingFocus(true);
        const payload = await getTreeFocus(treeId, targetFocusId, {
          childrenPage: 1,
          childrenLimit: 90,
          spouseLimit: 70,
          siblingLimit: 70
        });
        setFocusBundle(mapTreeFocusToBundle(payload));

        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load focus node relations.";

        if (isPasswordError(message)) {
          clearTreeAccessPassword(treeId);
          clearTreeAccessToken(treeId);
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
    [treeId]
  );

  useEffect(() => {
    setTree(null);
    setFocusId(null);
    setFocusBundle(null);
    setSubscription(null);
    setRequiresPassword(false);
    setPasswordError(null);
    clearTreeAccessPassword(treeId);
    clearTreeAccessToken(treeId);
  }, [treeId]);

  useEffect(() => {
    if (!treeId) {
      return;
    }

    if (!getToken()) {
      router.replace("/login");
      return;
    }

    const currentUser = getCurrentUser();
    setCurrentUserId(currentUser ? currentUser._id : null);
    void Promise.all([loadTree(), loadSubscription()]);
  }, [loadSubscription, loadTree, router, treeId]);

  useEffect(() => {
    if (!focusId || !tree) {
      setFocusBundle(null);
      return;
    }

    void loadFocusBundle(focusId);
  }, [focusId, loadFocusBundle, tree]);

  useEffect(() => {
    if (!isDetailModalOpen || !tree?.canEdit || !detailBundle) {
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoadingRelationMembers(true);
        const result = await searchMembers(treeId, relationMemberSearch, 1, 80);

        if (!active) {
          return;
        }

        setRelationMemberOptions(result.members.filter((member) => member._id !== detailBundle.focus._id));
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load members for relation linking.");
        }
      } finally {
        if (active) {
          setLoadingRelationMembers(false);
        }
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [detailBundle, isDetailModalOpen, relationMemberSearch, tree?.canEdit, treeId]);

  const handleFocusChange = useCallback((memberId: string) => {
    setFocusId((current) => {
      if (!memberId || current === memberId) {
        return current;
      }

      return memberId;
    });
  }, []);

  const submitTreePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!treePasswordInput.trim()) {
      setPasswordError("Tree password is required.");
      return;
    }

    try {
      setPasswordSubmitting(true);
      await loadTree(treePasswordInput.trim());
      setTreePasswordInput("");
      showToast("Tree unlocked successfully.", "success");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const openAddModal = () => {
    if (!tree?.canEdit) {
      setError("Only tree owner or admin can add members.");
      return;
    }

    if (memberLimitReached) {
      const message = memberLimitMessage;
      setError(message);
      showToast(message, "error");
      return;
    }

    setAddForm({
      name: "",
      note: "",
      relationType: "son",
      gender: autoGenderForRelation("son", focusBundle?.focus.gender),
      importantDates: [createImportantDateRow(1)],
      education: "",
      qualification: "",
      designation: "",
      addressPermanent: "",
      addressCurrent: ""
    });
    setAddImageFile(null);
    setIsAddModalOpen(true);
  };

  const submitAddMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!addForm.name.trim()) {
      setError("Member name is required.");
      return;
    }

    try {
      setSubmittingAdd(true);
      const resolvedRelation = resolveAddRelation(addForm.relationType);
      const relationType = focusId ? resolvedRelation.relationType : undefined;
      const relationTargetId = focusId ?? undefined;
      const mappedDates = mapImportantDatesToLegacyFields(addForm.importantDates);
      const customDateNotes = mappedDates.customDateNotes.length ? `Important dates:\n${mappedDates.customDateNotes.join("\n")}` : "";
      const mergedImportantNotes = [customDateNotes].filter(Boolean).join("\n\n");

      const payload: AddMemberPayload = {
        name: addForm.name.trim(),
        note: addForm.note.trim() || undefined,
        gender: addForm.gender || undefined,
        relationType: relationType === "none" ? undefined : relationType,
        relatedMemberId: relationType === "none" ? undefined : relationTargetId,
        dateOfBirth: mappedDates.dateOfBirth,
        anniversaryDate: mappedDates.anniversaryDate,
        dateOfDeath: mappedDates.dateOfDeath,
        education: addForm.education.trim() || undefined,
        qualification: addForm.qualification.trim() || undefined,
        designation: addForm.designation.trim() || undefined,
        addressPermanent: addForm.addressPermanent.trim() || undefined,
        addressCurrent: addForm.addressCurrent.trim() || undefined,
        importantNotes: mergedImportantNotes || undefined
      };

      const response = await createMember(treeId, payload, addImageFile);
      const shouldKeepParentFocus = relationType === "child" && Boolean(focusId);

      if (shouldKeepParentFocus && focusId) {
        await loadFocusBundle(focusId);
      } else {
        setFocusId(response.focus._id);
        setFocusBundle(response);
      }
      setTree((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          memberCount: current.memberCount + 1,
          rootMemberId: current.rootMemberId || current.rootMember || response.focus._id,
          rootMember: current.rootMember || response.focus._id,
          initialFocusMember: current.initialFocusMember || response.focus._id
        };
      });

      setIsAddModalOpen(false);
      setAddImageFile(null);
      setError(null);
      await loadSubscription();
      showToast("Member added successfully.", "success");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Failed to add member.";
      setError(message);
      if (message.toLowerCase().includes("limit") || message.toLowerCase().includes("subscription")) {
        await loadSubscription();
      }
      showToast(message, "error");
    } finally {
      setSubmittingAdd(false);
    }
  };

  const openDetailModal = useCallback(
    async (member: Member) => {
      try {
        setSelectedPerson(member);
        setIsDetailModalOpen(true);
        setLoadingDetail(true);
        setDetailBundle(null);
        setDetailImageFile(null);
        setDetailModalView("edit");
        setMode("view");
        setRemovingRelationKey(null);
        setRelationAction("connect");
        setRelationType("spouse");
        setRelationParentRole("auto");
        setRelationTargetMemberId("");
        setRelationMemberSearch("");
        setRelationMemberOptions([]);

        const payload = await getMemberWithRelations(treeId, member._id, {
          childrenPage: 1,
          childrenLimit: 100,
          spouseLimit: 80,
          siblingLimit: 80
        });
        setDetailBundle(payload);
        setSelectedPerson(payload.focus);
        setDetailName(payload.focus.name);
        setDetailNote(payload.focus.note || "");
        setError(null);
      } catch (detailError) {
        const message = detailError instanceof Error ? detailError.message : "Failed to load member details.";
        const friendlyMessage = isMemberNotFoundError(message) ? "Member not found" : message;
        setError(friendlyMessage);
        showToast(friendlyMessage, "error");
      } finally {
        setLoadingDetail(false);
      }
    },
    [isMemberNotFoundError, showToast, treeId]
  );

  const closeDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setMode("view");
    setDetailModalView("edit");
    setSelectedPerson(null);
  }, []);

  const saveMemberDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!detailBundle || !tree?.canEdit) {
      return;
    }

    if (!detailName.trim()) {
      setError("Member name is required.");
      return;
    }

    try {
      setSavingDetail(true);
      const response = await updateMember(
        treeId,
        detailBundle.focus._id,
        {
          name: detailName.trim(),
          note: detailNote.trim()
        },
        detailImageFile
      );

      setDetailBundle(response);
      setSelectedPerson(response.focus);
      setDetailImageFile(null);
      setDetailName(response.focus.name);
      setDetailNote(response.focus.note || "");
      setMode("view");

      if (focusId) {
        await loadFocusBundle(focusId);
      }

      setError(null);
      showToast("Member details updated.", "success");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Failed to update member.";
      setError(message);
      showToast(message, "error");
    } finally {
      setSavingDetail(false);
    }
  };

  const applyRelationMutation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!detailBundle || !tree?.canEdit) {
      return;
    }

    if (!relationTargetMemberId) {
      setError("Select a target member for relation update.");
      return;
    }

    try {
      setRelationSubmitting(true);

      const response = await updateMemberRelation(treeId, detailBundle.focus._id, {
        action: relationAction,
        relation: relationType,
        targetMemberId: relationTargetMemberId,
        parentRole: relationType === "child" ? relationParentRole : undefined
      });

      setDetailBundle(response);
      setRelationTargetMemberId("");

      if (focusId === response.focus._id) {
        setFocusBundle(response);
      } else if (focusId) {
        await loadFocusBundle(focusId);
      }

      setError(null);
      showToast(`Relation ${relationAction} applied.`, "success");
    } catch (relationError) {
      const message = relationError instanceof Error ? relationError.message : "Failed to update relation.";
      setError(message);
      showToast(message, "error");
    } finally {
      setRelationSubmitting(false);
    }
  };

  const removeRelationship = async (
    relationType: RemoveRelationType,
    relatedMemberId: string,
    relatedMemberName: string
  ) => {
    if (!detailBundle || !tree?.canEdit) {
      return;
    }

    if (!window.confirm("Remove this relationship?")) {
      return;
    }

    const loadingKey = `${relationType}:${relatedMemberId}`;

    try {
      setRemovingRelationKey(loadingKey);
      const response = await removeMemberRelation({
        memberId: detailBundle.focus._id,
        relationType,
        relatedMemberId
      });

      setDetailBundle(response);

      if (focusId === response.focus._id) {
        setFocusBundle(response);
      } else if (focusId) {
        await loadFocusBundle(focusId);
      } else {
        setFocusId(response.focus._id);
      }

      setError(null);
      showToast(`Relationship removed: ${relatedMemberName}`, "success");
    } catch (relationError) {
      const message = relationError instanceof Error ? relationError.message : "Failed to remove relationship.";
      setError(message);
      showToast(message, "error");
    } finally {
      setRemovingRelationKey(null);
    }
  };

  const removeMember = async (shouldDeleteSubtree: boolean) => {
    if (!detailBundle || !tree?.canEdit) {
      return;
    }

    if (detailBundle.focus.isRoot) {
      const rootDeleteMessage = "Root member cannot be deleted.";
      setError(rootDeleteMessage);
      showToast(rootDeleteMessage, "error");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this member?")) {
      return;
    }

    const preferredParentId = detailBundle.relations.father?._id || detailBundle.relations.mother?._id || null;

    try {
      setDeletingDetail(true);
      const response = await deleteMember(treeId, detailBundle.focus._id, shouldDeleteSubtree);

      setTree((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          memberCount: Math.max(current.memberCount - response.deletedCount, 0),
          rootMemberId: response.rootMember,
          rootMember: response.rootMember,
          initialFocusMember: response.rootMember
        };
      });

      setIsDetailModalOpen(false);
      setSelectedPerson(null);
      setDetailBundle(null);
      setDetailImageFile(null);

      const deletedFocus = focusId && response.deletedIds.includes(focusId);

      if (!response.rootMember) {
        setFocusId(null);
        setFocusBundle(null);
      } else if (deletedFocus) {
        const parentStillAvailable =
          preferredParentId && !response.deletedIds.includes(preferredParentId) ? preferredParentId : null;
        setFocusId(parentStillAvailable || response.rootMember);
      } else if (focusId) {
        await loadFocusBundle(focusId);
      } else {
        setFocusId(response.rootMember);
      }

      setError(null);
      await loadSubscription();
      showToast(`Member deleted (${response.deletedCount} removed).`, "success");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Failed to delete member.";
      setError(message);
      showToast(message, "error");
    } finally {
      setDeletingDetail(false);
    }
  };

  const detailCanEdit = Boolean(tree?.canEdit);
  const canDeleteDetailMember = Boolean(detailCanEdit && detailBundle && !detailBundle.focus.isRoot);
  const detailHasChildren = Boolean((detailBundle?.relationMeta.children.total || 0) > 0);
  const detailRelationLabel = resolveRelationToCurrentFocus(detailBundle?.focus || null, focusBundle);

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
          {tree?.canEdit && !loadingSubscription && memberLimitReached && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {memberLimitMessage}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="button-secondary"
            onClick={() => void exportTreeAsPdf()}
            disabled={exporting !== null || loadingTree}
          >
            {exporting === "pdf" ? t("tree.exportingPdf") : t("tree.exportPdf")}
          </button>
          {tree?.slug && (
            <button type="button" className="button-secondary" onClick={() => void copyShareLink()}>
              {t("tree.shareCopy")}
            </button>
          )}
          {tree?.canEdit && (
            <button type="button" className="button-primary" onClick={openAddModal} disabled={memberLimitReached}>
              {t("tree.addMember")}
            </button>
          )}
          <Link href="/dashboard" className="button-secondary">
            {t("tree.backToDashboard")}
          </Link>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {toasts.length > 0 && (
        <div className="fixed right-4 top-20 z-[80] flex w-[320px] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-lg border px-3 py-2 text-sm shadow-md ${
                toast.kind === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : toast.kind === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <article className="panel">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">{t("tree.focusNode")}</h2>
            {!focusBundle ? (
              <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">
                  {loadingTree ? "Loading..." : "No focus member available for this tree."}
                </p>
                {tree?.canEdit && !loadingTree && (
                  <button type="button" className="button-primary w-full" onClick={openAddModal} disabled={memberLimitReached}>
                    {t("tree.addFirstMember")}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="font-semibold text-slate-900">{t("tree.name")}:</span> {focusBundle.focus.name}
                </p>
                {canEditMyProfile && (
                  <Link href="/account" className="button-secondary inline-flex w-fit text-xs">
                    Edit My Profile
                  </Link>
                )}
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
                <p>
                  <span className="font-semibold text-slate-900">{t("tree.childrenLoaded")}:</span>{" "}
                  {focusBundle.relations.children.length}/{focusBundle.relationMeta.children.total}
                </p>
                {focusBundle.focus.note && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {focusBundle.focus.note}
                  </p>
                )}
              </div>
            )}
          </article>

          <article className="panel">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">{t("tree.navigationControls")}</h2>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>Scroll up: focus father/mother</li>
              <li>Scroll down: focus first child</li>
              <li>Scroll left: focus first sibling</li>
              <li>Scroll right: focus first spouse</li>
              <li>Arrow keys do the same directional focus jumps</li>
              <li>Hold Ctrl + Wheel or use +/- for zoom</li>
              <li>Drag canvas to pan</li>
            </ul>
            {loadingFocus && <p className="mt-3 text-xs text-slate-500">{t("tree.loadingFocus")}</p>}
          </article>
        </aside>

        <div className="relative">
          <TreeCanvas bundle={focusBundle} onFocusChange={handleFocusChange} onNodeInfo={openDetailModal} />
          {loadingFocus && (
            <div className="absolute inset-0 rounded-xl border border-slate-200/70 bg-white/60 p-6 backdrop-blur-[1px]">
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
                <p className="text-sm font-medium text-slate-700">{t("tree.loadingFocus")}</p>
              </div>
              <div className="space-y-4 animate-pulse">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="h-[460px] w-full rounded-lg bg-slate-100" />
                <div className="flex gap-3">
                  <div className="h-3 w-28 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-200" />
                  <div className="h-3 w-32 rounded bg-slate-200" />
                </div>
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
            <form onSubmit={submitTreePassword} className="mt-4 space-y-3">
              <input
                className="field"
                type="password"
                value={treePasswordInput}
                onChange={(event) => setTreePasswordInput(event.target.value)}
                placeholder="Tree password"
                required
              />
              <div className="flex gap-2">
                <button type="submit" className="button-primary flex-1" disabled={passwordSubmitting}>
                  {passwordSubmitting ? "Verifying..." : "Unlock Tree"}
                </button>
                <Link href="/" className="button-secondary flex-1 text-center">
                  Back
                </Link>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">{t("tree.addMember")}</h2>
              <button type="button" className="button-secondary" onClick={() => setIsAddModalOpen(false)}>
                Close
              </button>
            </div>

            <form onSubmit={submitAddMember} className="space-y-3">
              <input
                className="field"
                placeholder="Name"
                value={addForm.name}
                onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
                required
              />

              <select
                className="field"
                value={addForm.relationType}
                onChange={(event) => {
                  const nextRelationType = event.target.value as AddRelationOption;
                  setAddForm((current) => ({
                    ...current,
                    relationType: nextRelationType,
                    gender: autoGenderForRelation(nextRelationType, focusBundle?.focus.gender)
                  }));
                }}
              >
                {relationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>

              <select
                className="field"
                value={addForm.gender}
                onChange={(event) => setAddForm((current) => ({ ...current, gender: event.target.value as Gender | "" }))}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="unspecified">Prefer not to say</option>
              </select>

              <textarea
                className="field min-h-20"
                placeholder="Optional note"
                value={addForm.note}
                onChange={(event) => setAddForm((current) => ({ ...current, note: event.target.value }))}
              />

              <DateFieldGroup
                importantDates={addForm.importantDates}
                onChange={(importantDates) => setAddForm((current) => ({ ...current, importantDates }))}
              />

              <input
                className="field"
                type="text"
                placeholder="Education"
                value={addForm.education}
                onChange={(event) => setAddForm((current) => ({ ...current, education: event.target.value }))}
              />

              <input
                className="field"
                type="text"
                placeholder="Qualification"
                value={addForm.qualification}
                onChange={(event) => setAddForm((current) => ({ ...current, qualification: event.target.value }))}
              />

              <input
                className="field"
                type="text"
                placeholder="Designation"
                value={addForm.designation}
                onChange={(event) => setAddForm((current) => ({ ...current, designation: event.target.value }))}
              />

              <textarea
                className="field min-h-20"
                placeholder="Permanent address"
                value={addForm.addressPermanent}
                onChange={(event) => setAddForm((current) => ({ ...current, addressPermanent: event.target.value }))}
              />

              <textarea
                className="field min-h-20"
                placeholder="Current address"
                value={addForm.addressCurrent}
                onChange={(event) => setAddForm((current) => ({ ...current, addressCurrent: event.target.value }))}
              />

              {!focusId && (
                <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  No focus member selected. This member will be created without an attached relation.
                </p>
              )}

              <input
                className="field"
                type="file"
                accept="image/*"
                onChange={(event) => setAddImageFile(event.target.files?.[0] ?? null)}
              />

              <button type="submit" className="button-primary w-full" disabled={submittingAdd}>
                {submittingAdd ? "Creating..." : t("tree.addMember")}
              </button>
            </form>
          </div>
        </div>
      )}

      {isDetailModalOpen && selectedPerson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/65 p-4"
          onClick={closeDetailModal}
        >
          <div
            className="relative z-[60] max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-4 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
              <h2 className="text-xl font-semibold text-slate-900">Member Details</h2>
              <button type="button" className="button-secondary" onClick={closeDetailModal}>
                Close
              </button>
            </div>

            {loadingDetail || !detailBundle ? (
              <p className="text-sm text-slate-600">Loading member details...</p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                <aside className="space-y-3">
                  {detailBundle.focus.profileImage ? (
                    <div className="relative h-48 w-full overflow-hidden rounded-lg border border-slate-200">
                      <Image
                        src={`${uploadsBaseUrl}${detailBundle.focus.profileImage}`}
                        alt={`${detailBundle.focus.name} profile`}
                        fill
                        className="object-cover"
                        sizes="220px"
                      />
                    </div>
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500">
                      No image
                    </div>
                  )}

                  <button
                    type="button"
                    className="button-secondary w-full"
                    onClick={() => {
                      setFocusId(detailBundle.focus._id);
                      closeDetailModal();
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
                        setMode("view");
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
                          setMode("view");
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
                          setMode("view");
                          setDetailModalView("delete");
                        }}
                      >
                        Delete Member
                      </button>
                    )}
                  </div>

                  {detailModalView === "edit" && (
                    <form onSubmit={saveMemberDetails} className="space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row">
                          {detailBundle.focus.profileImage ? (
                            <div className="relative h-36 w-full overflow-hidden rounded-lg border border-slate-200 sm:w-32">
                              <Image
                                src={`${uploadsBaseUrl}${detailBundle.focus.profileImage}`}
                                alt={`${detailBundle.focus.name} profile`}
                                fill
                                className="object-cover"
                                sizes="128px"
                              />
                            </div>
                          ) : (
                            <div className="flex h-36 w-full items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 sm:w-32">
                              No image
                            </div>
                          )}

                          <div className="flex-1 space-y-3">
                            <div>
                              <h3 className="text-2xl font-bold text-slate-900">{detailBundle.focus.name}</h3>
                              <p className="text-sm text-slate-500">{detailRelationLabel}</p>
                            </div>

                            <div className="space-y-2 border-t border-slate-200 pt-3 text-sm text-slate-700">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Personal Information</h4>
                              <p>
                                <span className="font-semibold">Gender:</span> {detailBundle.focus.gender || "unspecified"}
                              </p>
                              <p>
                                <span className="font-semibold">Personal Note:</span> {detailBundle.focus.note || "-"}
                              </p>
                            </div>

                            <div className="space-y-2 border-t border-slate-200 pt-3 text-sm text-slate-700">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Important Dates</h4>
                              <p>
                                <span className="font-semibold">Date of Birth:</span>{" "}
                                {formatDate(detailBundle.focus.dateOfBirth || detailBundle.focus.birthDate)}
                              </p>
                              <p>
                                <span className="font-semibold">Anniversary:</span> {formatDate(detailBundle.focus.anniversaryDate)}
                              </p>
                              <p>
                                <span className="font-semibold">Date of Death:</span>{" "}
                                {formatDate(detailBundle.focus.dateOfDeath || detailBundle.focus.deathDate)}
                              </p>
                            </div>

                            <div className="space-y-2 border-t border-slate-200 pt-3 text-sm text-slate-700">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</h4>
                              <p>
                                <span className="font-semibold">Permanent:</span> {detailBundle.focus.addressPermanent || "-"}
                              </p>
                              <p>
                                <span className="font-semibold">Current:</span> {detailBundle.focus.addressCurrent || "-"}
                              </p>
                            </div>

                            <div className="space-y-2 border-t border-slate-200 pt-3 text-sm text-slate-700">
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
                        </div>
                      </div>

                      {mode === "edit" ? (
                        <>
                          <input
                            className="field"
                            value={detailName}
                            onChange={(event) => setDetailName(event.target.value)}
                            placeholder="Name"
                            required
                            disabled={!tree?.canEdit}
                          />

                          <textarea
                            className="field min-h-24"
                            value={detailNote}
                            onChange={(event) => setDetailNote(event.target.value)}
                            placeholder="Optional note"
                            disabled={!tree?.canEdit}
                          />

                          <input
                            className="field"
                            type="file"
                            accept="image/*"
                            onChange={(event) => setDetailImageFile(event.target.files?.[0] ?? null)}
                            disabled={!tree?.canEdit}
                          />

                          <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                            <p>
                              <span className="font-semibold">{t("tree.father")}:</span>{" "}
                              {detailBundle.relations.father ? detailBundle.relations.father.name : t("common.notAvailable")}
                            </p>
                            <p>
                              <span className="font-semibold">{t("tree.mother")}:</span>{" "}
                              {detailBundle.relations.mother ? detailBundle.relations.mother.name : t("common.notAvailable")}
                            </p>
                            <p>
                              <span className="font-semibold">{t("tree.spouses")}:</span>{" "}
                              {detailBundle.relations.spouses.map((member) => member.name).join(", ") || "None"}
                              {detailBundle.relationMeta.spouses.total > detailBundle.relations.spouses.length
                                ? ` (+${detailBundle.relationMeta.spouses.total - detailBundle.relations.spouses.length} more)`
                                : ""}
                            </p>
                            <p>
                              <span className="font-semibold">{t("tree.siblings")}:</span>{" "}
                              {detailBundle.relations.siblings.map((member) => member.name).join(", ") || "None"}
                              {detailBundle.relationMeta.siblings.total > detailBundle.relations.siblings.length
                                ? ` (+${detailBundle.relationMeta.siblings.total - detailBundle.relations.siblings.length} more)`
                                : ""}
                            </p>
                            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <p className="text-xs text-slate-600">
                                <span className="font-semibold text-slate-900">{t("tree.children")}:</span>{" "}
                                {detailBundle.relationMeta.children.loaded}/{detailBundle.relationMeta.children.total}
                                {detailBundle.relationMeta.children.hasMore ? " loaded" : ""}
                              </p>
                              <VirtualizedMemberList members={detailBundle.relations.children} />
                            </div>
                          </div>

                          {tree?.canEdit ? (
                            <button type="submit" className="button-primary w-full" disabled={savingDetail}>
                              {savingDetail ? "Saving..." : "Update Member"}
                            </button>
                          ) : (
                            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              Read-only access. Only tree owner/admin can update members.
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          {detailCanEdit ? (
                            <button type="button" className="button-primary w-full" onClick={() => setMode("edit")}>
                              Edit
                            </button>
                          ) : (
                            <p className="text-xs text-slate-600">
                              Read-only access. Only tree owner/admin can update members.
                            </p>
                          )}
                        </div>
                      )}
                    </form>
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
                                          void removeRelationship(
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
                                          void removeRelationship(
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
                                      onClick={() => void removeRelationship("spouse", member._id, member.name)}
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
                                      onClick={() => void removeRelationship("sibling", member._id, member.name)}
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
                                      onClick={() => void removeRelationship("child", member._id, member.name)}
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

                          <form onSubmit={applyRelationMutation} className="space-y-3 rounded-lg border border-slate-200 p-3">
                            <h3 className="text-sm font-semibold text-slate-900">Relation Engine</h3>
                            <p className="text-xs text-slate-500">
                              Manage direct relationship links from <span className="font-semibold">{detailBundle.focus.name}</span>.
                            </p>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <select
                                className="field"
                                value={relationAction}
                                onChange={(event) => setRelationAction(event.target.value as RelationMutationAction)}
                              >
                                <option value="connect">Connect</option>
                                <option value="disconnect">Disconnect</option>
                              </select>

                              <select
                                className="field"
                                value={relationType}
                                onChange={(event) => setRelationType(event.target.value as RelationMutationType)}
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
                                onChange={(event) => setRelationParentRole(event.target.value as "father" | "mother" | "auto")}
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
                              onChange={(event) => setRelationMemberSearch(event.target.value)}
                            />

                            <select
                              className="field"
                              value={relationTargetMemberId}
                              onChange={(event) => setRelationTargetMemberId(event.target.value)}
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
                              <p className="text-xs text-red-700">
                                This member has children. Choose what to delete.
                              </p>
                              <button
                                type="button"
                                className="w-full rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                                onClick={() => void removeMember(false)}
                                disabled={deletingDetail}
                              >
                                {deletingDetail ? "Deleting..." : "Delete only this member"}
                              </button>
                              <p className="text-xs text-red-700">
                                Children will be relinked to available parent when possible.
                              </p>
                              <button
                                type="button"
                                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                                onClick={() => void removeMember(true)}
                                disabled={deletingDetail}
                              >
                                {deletingDetail ? "Deleting..." : "Delete entire subtree"}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                              onClick={() => void removeMember(false)}
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
          </div>
        </div>
      )}
    </main>
  );
}
