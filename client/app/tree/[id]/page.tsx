"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import TreeCanvas from "@/components/TreeCanvas";
import MemberModal from "@/components/MemberModal";
import MemberForm, { MemberFormSubmitData } from "@/components/MemberForm";
import { toImportantDateEntries } from "@/lib/importantDates";
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
import { wouldCreateCircularRelation } from "@/utils/relationGuard";

const relationMutationOptions: { value: RelationMutationType; labelKey: string }[] = [
  { value: "father", labelKey: "tree.father" },
  { value: "mother", labelKey: "tree.mother" },
  { value: "child", labelKey: "tree.child" },
  { value: "spouse", labelKey: "tree.spouse" },
  { value: "sibling", labelKey: "tree.sibling" }
];

type DetailModalView = "edit" | "relations" | "delete";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
};

const TOAST_TIMEOUT_MS = 3600;
const EXPORT_PAGE_SIZE = 100;

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

function resolveAddRelation(relation: MemberFormSubmitData["relationType"]): { relationType: RelationType } {
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

function replaceMemberInBundle(
  bundle: MemberWithRelationsResponse | null,
  updatedMember: Member
): MemberWithRelationsResponse | null {
  if (!bundle) {
    return bundle;
  }

  const replace = (member: Member | null) => (member && member._id === updatedMember._id ? updatedMember : member);

  return {
    ...bundle,
    focus: bundle.focus._id === updatedMember._id ? updatedMember : bundle.focus,
    relations: {
      father: replace(bundle.relations.father),
      mother: replace(bundle.relations.mother),
      spouses: bundle.relations.spouses.map((member) => (member._id === updatedMember._id ? updatedMember : member)),
      siblings: bundle.relations.siblings.map((member) => (member._id === updatedMember._id ? updatedMember : member)),
      children: bundle.relations.children.map((member) => (member._id === updatedMember._id ? updatedMember : member))
    },
    nodes: bundle.nodes.map((member) => (member._id === updatedMember._id ? updatedMember : member))
  };
}

function mergeTreeDataIntoBundle(
  bundle: MemberWithRelationsResponse | null,
  treeData: Member[]
): MemberWithRelationsResponse | null {
  if (!bundle || treeData.length === 0) {
    return bundle;
  }

  const membersById = new Map(treeData.map((member) => [member._id, member]));
  const mergeMember = (member: Member | null): Member | null => {
    if (!member) {
      return member;
    }

    const updated = membersById.get(member._id);
    return updated ? { ...member, ...updated } : member;
  };

  return {
    ...bundle,
    focus: mergeMember(bundle.focus) || bundle.focus,
    relations: {
      father: mergeMember(bundle.relations.father),
      mother: mergeMember(bundle.relations.mother),
      spouses: bundle.relations.spouses.map((member) => mergeMember(member) || member),
      siblings: bundle.relations.siblings.map((member) => mergeMember(member) || member),
      children: bundle.relations.children.map((member) => mergeMember(member) || member)
    },
    nodes: bundle.nodes.map((member) => mergeMember(member) || member)
  };
}

function replaceMemberInTreeData(treeData: Member[], updatedMember: Member): Member[] {
  return treeData.map((member) => (member._id === updatedMember._id ? { ...member, ...updatedMember } : member));
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
  const [treeData, setTreeData] = useState<Member[]>([]);

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

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    member: Member | null;
    mode: "view" | "edit";
  }>({
    isOpen: false,
    member: null,
    mode: "view"
  });
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailBundle, setDetailBundle] = useState<MemberWithRelationsResponse | null>(null);
  const [deletingDetail, setDeletingDetail] = useState(false);
  const [removingMemberImage, setRemovingMemberImage] = useState(false);
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
  const treeCanvasBundle = useMemo(() => mergeTreeDataIntoBundle(focusBundle, treeData), [focusBundle, treeData]);

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
    setTreeData([]);
    setSubscription(null);
    setRequiresPassword(false);
    setPasswordError(null);
    clearTreeAccessPassword(treeId);
    clearTreeAccessToken(treeId);
  }, [treeId]);

  useEffect(() => {
    setTreeData(focusBundle?.nodes || []);
  }, [focusBundle]);

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
    if (!modalState.isOpen || !tree?.canEdit || !detailBundle) {
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
  }, [detailBundle, modalState.isOpen, relationMemberSearch, tree?.canEdit, treeId]);

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

    setIsAddModalOpen(true);
  };

  const submitAddMember = async (data: MemberFormSubmitData) => {
    if (!data.name.trim()) {
      setError("Member name is required.");
      return;
    }

    try {
      const resolvedRelation = resolveAddRelation(data.relationType);
      const relationType = focusId ? resolvedRelation.relationType : undefined;
      const relationTargetId = focusId ?? undefined;
      const importantDates = toImportantDateEntries(data.importantDates);

      const payload: AddMemberPayload = {
        name: data.name.trim(),
        note: data.note.trim() || undefined,
        gender: data.gender || undefined,
        relationType: relationType === "none" ? undefined : relationType,
        relatedMemberId: relationType === "none" ? undefined : relationTargetId,
        importantDates,
        education: data.education.trim() || undefined,
        qualification: data.qualification.trim() || undefined,
        designation: data.designation.trim() || undefined,
        addressPermanent: data.addressPermanent.trim() || undefined,
        addressCurrent: data.addressCurrent.trim() || undefined
      };

      const response = await createMember(treeId, payload, data.imageFile);
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
    }
  };

  const closeDetailModal = useCallback(() => {
    setModalState({
      isOpen: false,
      member: null,
      mode: "view"
    });
    setDetailBundle(null);
    setDetailModalView("edit");
    setDeletingDetail(false);
    setRemovingMemberImage(false);
    setRemovingRelationKey(null);
    setRelationAction("connect");
    setRelationType("spouse");
    setRelationParentRole("auto");
    setRelationTargetMemberId("");
    setRelationMemberSearch("");
    setRelationMemberOptions([]);
  }, []);

  const openDetailModal = useCallback(
    async (member: Member) => {
      try {
        setModalState({
          isOpen: true,
          member,
          mode: "view"
        });
        setLoadingDetail(true);
        setDetailBundle(null);
        setDetailModalView("edit");
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
        setModalState((current) => {
          if (!current.isOpen || current.member?._id !== member._id) {
            return current;
          }

          return {
            ...current,
            member: payload.focus
          };
        });
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

  const saveMemberDetails = async (data: MemberFormSubmitData): Promise<boolean> => {
    if (!detailBundle || !tree?.canEdit) {
      return false;
    }

    if (!data.name.trim()) {
      setError("Member name is required.");
      return false;
    }

    try {
      const importantDates = toImportantDateEntries(data.importantDates);

      const response = await updateMember(
        treeId,
        detailBundle.focus._id,
        {
          name: data.name.trim(),
          note: data.note.trim(),
          gender: data.gender || null,
          profileImage: data.removeImage ? null : undefined,
          importantDates,
          education: data.education.trim() || null,
          qualification: data.qualification.trim() || null,
          designation: data.designation.trim() || null,
          addressPermanent: data.addressPermanent.trim() || null,
          addressCurrent: data.addressCurrent.trim() || null
        },
        data.imageFile
      );

      const nextFocusMember = data.removeImage ? { ...response.focus, profileImage: null } : response.focus;
      const nextDetailBundle = data.removeImage ? replaceMemberInBundle(response, nextFocusMember) || response : response;

      setDetailBundle(nextDetailBundle);
      setTreeData((prev) => replaceMemberInTreeData(prev, nextFocusMember));
      setModalState((current) => {
        if (!current.isOpen) {
          return current;
        }

        return {
          ...current,
          member: nextFocusMember
        };
      });
      setFocusBundle((current) => {
        if (!current) {
          return current;
        }

        if (focusId === nextFocusMember._id) {
          return nextDetailBundle;
        }

        return replaceMemberInBundle(current, nextFocusMember);
      });

      setError(null);
      showToast("Member details updated.", "success");
      return true;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Failed to update member.";
      setError(message);
      showToast(message, "error");
      return false;
    }
  };

  const removeMemberImage = async () => {
    if (!detailBundle || !tree?.canEdit) {
      return;
    }

    try {
      setRemovingMemberImage(true);
      const response = await updateMember(treeId, detailBundle.focus._id, {
        profileImage: null
      });
      const nextFocusMember = { ...response.focus, profileImage: null };
      const nextDetailBundle = replaceMemberInBundle(response, nextFocusMember) || response;

      setDetailBundle(nextDetailBundle);
      setTreeData((prev) => replaceMemberInTreeData(prev, nextFocusMember));
      setModalState((current) => {
        if (!current.isOpen) {
          return current;
        }

        return {
          ...current,
          member: nextFocusMember
        };
      });
      setFocusBundle((current) => {
        if (!current) {
          return current;
        }

        if (focusId === nextFocusMember._id) {
          return nextDetailBundle;
        }

        return replaceMemberInBundle(current, nextFocusMember);
      });

      setError(null);
      showToast("Member image removed.", "success");
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : "Failed to remove member image.";
      setError(message);
      showToast(message, "error");
    } finally {
      setRemovingMemberImage(false);
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

    if (
      relationAction === "connect" &&
      (relationType === "father" || relationType === "mother" || relationType === "child")
    ) {
      const sourceIdForCheck = relationType === "child" ? relationTargetMemberId : detailBundle.focus._id;
      const targetIdForCheck = relationType === "child" ? detailBundle.focus._id : relationTargetMemberId;

      if (wouldCreateCircularRelation(sourceIdForCheck, targetIdForCheck, treeData)) {
        setError("Invalid relation: circular family relation detected.");
        return;
      }
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

      closeDetailModal();

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
          <TreeCanvas
            key={focusBundle?.focus?._id || "tree"}
            bundle={treeCanvasBundle}
            onFocusChange={handleFocusChange}
            onNodeInfo={openDetailModal}
          />
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

            {!focusId && (
              <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                No focus member selected. This member will be created without an attached relation.
              </p>
            )}

            <MemberForm mode="add" onSubmit={submitAddMember} onCancel={() => setIsAddModalOpen(false)} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {modalState.isOpen && modalState.member && (
          <MemberModal
            key={modalState.member._id}
            member={modalState.member}
            mode={modalState.mode}
            isOpen={modalState.isOpen}
            onClose={closeDetailModal}
            onEdit={() =>
              setModalState((prev) => ({
                ...prev,
                mode: "edit"
              }))
            }
            onSave={(updatedMember) =>
              setModalState((prev) => ({
                ...prev,
                member: updatedMember,
                mode: "view"
              }))
            }
            loadingDetail={loadingDetail}
            detailBundle={detailBundle}
            detailModalView={detailModalView}
            setDetailModalView={setDetailModalView}
            detailCanEdit={detailCanEdit}
            canDeleteDetailMember={canDeleteDetailMember}
            detailHasChildren={detailHasChildren}
            focusedMember={focusBundle?.focus || null}
            treeData={treeData}
            deletingDetail={deletingDetail}
            removingRelationKey={removingRelationKey}
            relationAction={relationAction}
            onRelationActionChange={setRelationAction}
            relationType={relationType}
            onRelationTypeChange={setRelationType}
            relationParentRole={relationParentRole}
            onRelationParentRoleChange={setRelationParentRole}
            relationTargetMemberId={relationTargetMemberId}
            onRelationTargetMemberIdChange={setRelationTargetMemberId}
            relationMemberSearch={relationMemberSearch}
            onRelationMemberSearchChange={setRelationMemberSearch}
            relationMemberOptions={relationMemberOptions}
            loadingRelationMembers={loadingRelationMembers}
            relationSubmitting={relationSubmitting}
            relationMutationOptions={relationMutationOptions}
            onSubmitMemberDetails={saveMemberDetails}
            onRemoveMemberImage={removeMemberImage}
            removingMemberImage={removingMemberImage}
            onApplyRelationMutation={applyRelationMutation}
            onRemoveRelationship={removeRelationship}
            onRemoveMember={removeMember}
            onSetFocusPerson={(memberId) => setFocusId(memberId)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}


