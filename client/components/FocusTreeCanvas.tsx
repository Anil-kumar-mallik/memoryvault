"use client";

import { KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { resolveProfileImageUrl } from "@/lib/profileImageUrl";
import { Member, MemberWithRelationsResponse } from "@/types";
import { resolveRelation } from "@/utils/relationResolver";

type Direction = "parent" | "child" | "sibling" | "spouse";
type RelationGroup = "focus" | "father" | "mother" | "spouse" | "child" | "sibling";

type VisualNode = {
  key: string;
  member: Member;
  x: number;
  y: number;
  group: RelationGroup;
};

type VisualLink = {
  key: string;
  sourceId: string;
  targetId: string;
  group: Exclude<RelationGroup, "focus">;
};

type AvatarConfig = {
  imageUrl: string | null;
  fallbackColor: string;
  initial: string;
};

interface FocusTreeCanvasProps {
  bundle: MemberWithRelationsResponse | null;
  onFocusChange: (memberId: string) => void;
  onNodeInfo: (member: Member) => void;
}

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 760;
const MAX_RENDERED_CHILDREN = 80;
const MAX_RENDERED_SIBLINGS = 48;
const MAX_RENDERED_SPOUSES = 32;
const NODE_DIAMETER = 120;
const NODE_RADIUS = NODE_DIAMETER / 2;
const NODE_CONTENT_WIDTH = 140;
const NODE_CONTENT_HEIGHT = 128;
const NODE_CONTENT_CLASS = "flex flex-col items-center text-center w-[140px]";
const NODE_AVATAR_CONTAINER_CLASS = "w-20 h-20 rounded-full overflow-hidden";
const NODE_AVATAR_IMAGE_CLASS = "w-full h-full object-cover";
const NODE_AVATAR_FALLBACK_CLASS = "block w-full h-full text-center text-3xl font-semibold leading-[80px] text-slate-700";
const NODE_NAME_CLASS = "mt-2 font-semibold text-sm truncate w-full";
const NODE_RELATION_CLASS = "text-xs text-gray-500 truncate w-full";

const colorByGroup: Record<RelationGroup, string> = {
  focus: "#1d4ed8",
  father: "#2563eb",
  mother: "#7c3aed",
  spouse: "#0f766e",
  child: "#0891b2",
  sibling: "#475569"
};

function normalizeMemberId(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function spread(count: number, spacing: number): number[] {
  if (count <= 1) {
    return [0];
  }

  const start = -((count - 1) * spacing) / 2;
  return Array.from({ length: count }, (_, index) => start + index * spacing);
}

function nextFocusId(direction: Direction, bundle: MemberWithRelationsResponse | null): string | null {
  if (!bundle) {
    return null;
  }

  const toFocusId = (value: unknown): string | null => {
    const normalized = normalizeMemberId(value);
    return normalized || null;
  };

  switch (direction) {
    case "parent":
      return toFocusId(bundle.relations.father?._id) || toFocusId(bundle.relations.mother?._id);
    case "child":
      return toFocusId(bundle.relations.children[0]?._id);
    case "sibling":
      return toFocusId(bundle.relations.siblings[0]?._id);
    case "spouse":
      return toFocusId(bundle.relations.spouses[0]?._id);
    default:
      return null;
  }
}

function buildVisualGraph(
  bundle: MemberWithRelationsResponse | null,
  treeData?: Member[]
): { nodes: VisualNode[]; links: VisualLink[] } {
  if (!bundle) {
    return { nodes: [], links: [] };
  }

  const memberById = new Map(
    (treeData || [])
      .map((member) => [normalizeMemberId(member._id), member] as const)
      .filter(([memberId]) => Boolean(memberId))
  );
  const resolveMember = (member: Member): Member => {
    const updated = memberById.get(normalizeMemberId(member._id));
    return updated ? { ...member, ...updated } : member;
  };

  const nodes = new Map<string, VisualNode>();
  const links: VisualLink[] = [];

  const setNode = (member: Member, group: RelationGroup, x: number, y: number) => {
    const memberId = normalizeMemberId(member._id);
    if (!memberId) {
      return;
    }

    if (!nodes.has(memberId)) {
      nodes.set(memberId, {
        key: memberId,
        member,
        x,
        y,
        group
      });
      return;
    }

    if (group === "focus") {
      nodes.set(memberId, {
        key: memberId,
        member,
        x,
        y,
        group
      });
    }
  };

  const focus = resolveMember(bundle.focus);
  setNode(focus, "focus", 0, 0);

  if (bundle.relations.father) {
    const father = resolveMember(bundle.relations.father);
    const focusId = normalizeMemberId(focus._id);
    const fatherId = normalizeMemberId(father._id);
    setNode(father, "father", -150, -220);
    if (focusId && fatherId) {
      links.push({
        key: `father-${fatherId}`,
        sourceId: focusId,
        targetId: fatherId,
        group: "father"
      });
    }
  }

  if (bundle.relations.mother) {
    const mother = resolveMember(bundle.relations.mother);
    const focusId = normalizeMemberId(focus._id);
    const motherId = normalizeMemberId(mother._id);
    setNode(mother, "mother", 150, -220);
    if (focusId && motherId) {
      links.push({
        key: `mother-${motherId}`,
        sourceId: focusId,
        targetId: motherId,
        group: "mother"
      });
    }
  }

  const visibleSpouses = bundle.relations.spouses.slice(0, MAX_RENDERED_SPOUSES);
  const spouseOffsets = spread(visibleSpouses.length, 120);
  visibleSpouses.forEach((sourceMember, index) => {
    const member = resolveMember(sourceMember);
    const focusId = normalizeMemberId(focus._id);
    const memberId = normalizeMemberId(member._id);
    setNode(member, "spouse", 330, spouseOffsets[index] ?? 0);
    if (focusId && memberId) {
      links.push({
        key: `spouse-${memberId}`,
        sourceId: focusId,
        targetId: memberId,
        group: "spouse"
      });
    }
  });

  const visibleSiblings = bundle.relations.siblings.slice(0, MAX_RENDERED_SIBLINGS);
  const siblingOffsets = spread(visibleSiblings.length, 120);
  visibleSiblings.forEach((sourceMember, index) => {
    const member = resolveMember(sourceMember);
    const focusId = normalizeMemberId(focus._id);
    const memberId = normalizeMemberId(member._id);
    setNode(member, "sibling", -330, siblingOffsets[index] ?? 0);
    if (focusId && memberId) {
      links.push({
        key: `sibling-${memberId}`,
        sourceId: focusId,
        targetId: memberId,
        group: "sibling"
      });
    }
  });

  const visibleChildren = bundle.relations.children.slice(0, MAX_RENDERED_CHILDREN);
  const childOffsets = spread(visibleChildren.length, 170);
  visibleChildren.forEach((sourceMember, index) => {
    const member = resolveMember(sourceMember);
    const focusId = normalizeMemberId(focus._id);
    const memberId = normalizeMemberId(member._id);
    setNode(member, "child", childOffsets[index] ?? 0, 240);
    if (focusId && memberId) {
      links.push({
        key: `child-${memberId}`,
        sourceId: focusId,
        targetId: memberId,
        group: "child"
      });
    }
  });

  return {
    nodes: Array.from(nodes.values()),
    links
  };
}

function nodeRadius(group: RelationGroup): number {
  return group === "focus" ? 50 : 38;
}

function avatarFallbackColor(member: Member): string {
  const gender = String(member.gender || "").toLowerCase();
  if (gender === "male") {
    return "#dbeafe";
  }

  if (gender === "female") {
    return "#fce7f3";
  }

  return "#e2e8f0";
}

function firstLetter(name: string): string {
  const normalized = String(name || "").trim();
  if (!normalized) {
    return "?";
  }

  return normalized.charAt(0).toUpperCase();
}

function FocusTreeCanvas({ bundle, onFocusChange, onNodeInfo }: FocusTreeCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sceneRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const bundleRef = useRef<MemberWithRelationsResponse | null>(bundle);
  const transformRef = useRef<d3.ZoomTransform>(
    d3.zoomIdentity.translate(VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2).scale(1)
  );
  const previousPositionRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastWheelNavigationRef = useRef(0);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const treeData = bundle?.nodes;

  const graph = useMemo(() => buildVisualGraph(bundle, treeData), [bundle, treeData]);
  const membersForRelation = useMemo(() => {
    const membersById = new Map<string, Member>();
    const addMember = (member?: Member | null) => {
      if (!member) {
        return;
      }

      const memberId = normalizeMemberId(member._id);
      if (!memberId) {
        return;
      }

      const existingMember = membersById.get(memberId);
      membersById.set(memberId, existingMember ? { ...existingMember, ...member } : member);
    };

    addMember(bundle?.focus || null);
    addMember(bundle?.relations.father || null);
    addMember(bundle?.relations.mother || null);
    bundle?.relations.spouses.forEach(addMember);
    bundle?.relations.children.forEach(addMember);
    bundle?.relations.siblings.forEach(addMember);
    graph.nodes.forEach((node) => addMember(node.member));

    return Array.from(membersById.values());
  }, [bundle, graph.nodes]);

  const relationLabelByNodeKey = useMemo(() => {
    const labels = new Map<string, string>();
    if (!bundle) {
      return labels;
    }

    const focusedMemberId = normalizeMemberId(bundle.focus._id);
    if (!focusedMemberId) {
      return labels;
    }

    const membersById = new Map(
      membersForRelation
        .map((member) => [normalizeMemberId(member._id), member] as const)
        .filter(([memberId]) => Boolean(memberId))
    );
    const normalizedFocusedMember = membersById.get(focusedMemberId) || bundle.focus;

    for (const node of graph.nodes) {
      const nodeId = normalizeMemberId(node.member._id || node.key);
      if (!nodeId) {
        continue;
      }

      const normalizedTarget = membersById.get(nodeId) || node.member;
      const isFocused = nodeId === focusedMemberId;

      if (isFocused) {
        labels.set(nodeId, "Self");
      } else {
        labels.set(nodeId, resolveRelation(normalizedTarget, normalizedFocusedMember, membersForRelation));
      }
    }
    return labels;
  }, [bundle, graph.nodes, membersForRelation]);
  const avatarConfigByMemberId = useMemo(() => {
    const map = new Map<string, AvatarConfig>();

    for (const node of graph.nodes) {
      const imageUrl = resolveProfileImageUrl(node.member.profileImage);
      const availableImageUrl = imageUrl && !failedImageUrls.has(imageUrl) ? imageUrl : null;
      map.set(normalizeMemberId(node.member._id), {
        imageUrl: availableImageUrl,
        fallbackColor: avatarFallbackColor(node.member),
        initial: firstLetter(node.member.name)
      });
    }

    return map;
  }, [failedImageUrls, graph.nodes]);

  const renderNodeAvatar = useCallback(
    (selection: d3.Selection<SVGGElement, VisualNode, SVGGElement, unknown>) => {
      selection.each(function (item) {
        const avatarConfig = avatarConfigByMemberId.get(normalizeMemberId(item.member._id));
        if (!avatarConfig) {
          return;
        }

        const node = d3.select(this);
        const avatarGroup = node
          .selectAll<SVGGElement, VisualNode>("g.mv-node-avatar")
          .data([item], (datum) => datum.member._id)
          .join(
            (enter) =>
              enter
                .insert("g", "g.mv-node-info")
                .attr("class", "mv-node-avatar")
                .style("pointer-events", "none"),
            (update) => update
          );

        avatarGroup
          .selectAll<SVGForeignObjectElement, VisualNode>("foreignObject.mv-node-content-shell")
          .data([item], (datum) => datum.member._id)
          .join("foreignObject")
          .attr("class", "mv-node-content-shell")
          .attr("x", -(NODE_CONTENT_WIDTH / 2))
          .attr("y", -40)
          .attr("width", NODE_CONTENT_WIDTH)
          .attr("height", NODE_CONTENT_HEIGHT);

        const containerSelection = avatarGroup
          .selectAll<SVGForeignObjectElement, VisualNode>("foreignObject.mv-node-content-shell")
          .selectAll<HTMLDivElement, VisualNode>(".mv-node-content")
          .data([item], (datum) => datum.member._id)
          .join("xhtml:div")
          .attr("class", NODE_CONTENT_CLASS);

        const avatarContainerSelection = containerSelection
          .selectAll<HTMLDivElement, AvatarConfig>(".mv-avatar-container")
          .data([avatarConfig])
          .join("xhtml:div")
          .attr("class", NODE_AVATAR_CONTAINER_CLASS)
          .style("background-color", (datum) => (datum.imageUrl ? "transparent" : datum.fallbackColor));

        avatarContainerSelection
          .selectAll<HTMLImageElement, string>(".mv-avatar-image")
          .data(avatarConfig.imageUrl ? [avatarConfig.imageUrl] : [], (datum) => datum)
          .join(
            (enter) =>
              enter
                .append("xhtml:img")
                .attr("class", `mv-avatar-image ${NODE_AVATAR_IMAGE_CLASS}`)
                .on("error", (_event, imageUrl) => {
                  if (!imageUrl) {
                    return;
                  }

                  setFailedImageUrls((current) => {
                    if (current.has(imageUrl)) {
                      return current;
                    }

                    const next = new Set(current);
                    next.add(imageUrl);
                    return next;
                  });
                }),
            (update) => update,
            (exit) => exit.remove()
          )
          .attr("src", (datum) => datum)
          .attr("alt", `${item.member.name || "Member"} profile image`);

        avatarContainerSelection
          .selectAll<HTMLSpanElement, string>(".mv-avatar-fallback")
          .data(avatarConfig.imageUrl ? [] : [avatarConfig.initial])
          .join("xhtml:span")
          .attr("class", `mv-avatar-fallback ${NODE_AVATAR_FALLBACK_CLASS}`)
          .text((datum) => datum);

        containerSelection
          .selectAll<HTMLHeadingElement, VisualNode>(".mv-node-name")
          .data([item], (datum) => datum.member._id)
          .join("xhtml:h3")
          .attr("class", NODE_NAME_CLASS)
          .attr("title", (datum) => datum.member.name || "")
          .text((datum) => datum.member.name || "Unnamed");

        containerSelection
          .selectAll<HTMLParagraphElement, VisualNode>(".mv-node-relation")
          .data([item], (datum) => datum.member._id)
          .join("xhtml:p")
          .attr("class", NODE_RELATION_CLASS)
          .text((datum) => relationLabelByNodeKey.get(normalizeMemberId(datum.member._id || datum.key)) || "Relative");
      });
    },
    [avatarConfigByMemberId, relationLabelByNodeKey]
  );

  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const scene = svg.append("g").attr("class", "mv-scene");
    sceneRef.current = scene;

    const defs = svg.append("defs");
    const shadow = defs
      .append("filter")
      .attr("id", "mv-node-shadow")
      .attr("x", "-40%")
      .attr("y", "-40%")
      .attr("width", "180%")
      .attr("height", "180%");
    shadow.append("feDropShadow").attr("dx", 0).attr("dy", 3).attr("stdDeviation", 4).attr("flood-color", "#0f172a").attr("flood-opacity", 0.2);
    const strongShadow = defs
      .append("filter")
      .attr("id", "mv-node-shadow-strong")
      .attr("x", "-40%")
      .attr("y", "-40%")
      .attr("width", "200%")
      .attr("height", "200%");
    strongShadow
      .append("feDropShadow")
      .attr("dx", 0)
      .attr("dy", 5)
      .attr("stdDeviation", 7)
      .attr("flood-color", "#0f172a")
      .attr("flood-opacity", 0.28);

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.5])
      .filter((event) => {
        if (event.type === "wheel") {
          return Boolean((event as WheelEvent).ctrlKey);
        }

        if (event.type === "dblclick") {
          return false;
        }

        return true;
      })
      .on("zoom", (event) => {
        scene.attr("transform", event.transform.toString());
        transformRef.current = event.transform;
      });

    zoomRef.current = zoomBehavior;

    svg
      .attr("viewBox", `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .call(zoomBehavior as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void)
      .call(zoomBehavior.transform, transformRef.current);

    svg.on("wheel.focus-navigation", (event: WheelEvent) => {
      if (event.ctrlKey) {
        return;
      }

      event.preventDefault();

      const now = Date.now();
      if (now - lastWheelNavigationRef.current < 180) {
        return;
      }

      lastWheelNavigationRef.current = now;

      const currentBundle = bundleRef.current;
      if (!currentBundle) {
        return;
      }

      const useVerticalAxis = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
      const direction: Direction = useVerticalAxis
        ? event.deltaY < 0
          ? "parent"
          : "child"
        : event.deltaX < 0
          ? "sibling"
          : "spouse";

      const targetId = nextFocusId(direction, currentBundle);
      if (targetId) {
        onFocusChange(targetId);
      }
    });

    return () => {
      svg.on("wheel.focus-navigation", null);
      svg.on(".zoom", null);
      svg.selectAll("*").remove();
    };
  }, [onFocusChange]);

  useEffect(() => {
    const scene = sceneRef.current;
    const svgElement = svgRef.current;
    const zoomBehavior = zoomRef.current;

    if (!scene || !svgElement || !zoomBehavior) {
      return;
    }

    const svg = d3.select(svgElement);
    scene.selectAll("text.mv-empty").remove();

    if (!bundle) {
      scene
        .append("text")
        .attr("class", "mv-empty")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .attr("font-size", 18)
        .text("Add a member to start the tree.");

      svg
        .transition()
        .duration(320)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2).scale(1));
      return;
    }

    const { nodes, links } = graph;
    const positionMap = new Map(
      nodes
        .map((node) => [normalizeMemberId(node.member._id), { x: node.x, y: node.y }] as const)
        .filter(([memberId]) => Boolean(memberId))
    );
    const transitionDuration = nodes.length > 140 ? 0 : nodes.length > 70 ? 260 : 520;
    const transition = transitionDuration > 0 ? d3.transition().duration(transitionDuration).ease(d3.easeCubicInOut) : null;

    const getLinkPath = (link: VisualLink) => {
      const source = positionMap.get(link.sourceId);
      const target = positionMap.get(link.targetId);

      if (!source || !target) {
        return "";
      }

      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      return `M ${source.x},${source.y} Q ${midX},${midY} ${target.x},${target.y}`;
    };

    const linkSelection = scene
      .selectAll<SVGPathElement, VisualLink>("path.mv-link")
      .data(links, (item) => item.key);

    const linkEnter = linkSelection
      .enter()
      .append("path")
      .attr("class", "mv-link")
      .attr("fill", "none")
      .attr("stroke-width", 2.3)
      .attr("opacity", 0.15)
      .attr("d", () => "M 0,0 Q 0,0 0,0");

    const mergedLinks = linkEnter.merge(
      linkSelection as unknown as d3.Selection<SVGPathElement, VisualLink, SVGGElement, unknown>
    );

    if (transition) {
      mergedLinks
        .transition(transition)
        .attr("stroke", (item) => colorByGroup[item.group])
        .attr("opacity", 0.65)
        .attr("d", (item) => getLinkPath(item));
    } else {
      mergedLinks
        .attr("stroke", (item) => colorByGroup[item.group])
        .attr("opacity", 0.65)
        .attr("d", (item) => getLinkPath(item));
    }

    if (transition) {
      linkSelection.exit().transition().duration(200).attr("opacity", 0).remove();
    } else {
      linkSelection.exit().remove();
    }

    const nodeSelection = scene
      .selectAll<SVGGElement, VisualNode>("g.mv-node")
      .data(nodes, (item) => item.key);

    const nodeEnter = nodeSelection
      .enter()
      .append("g")
      .attr("class", "mv-node")
      .attr("cursor", "pointer")
      .attr("transform", (item) => {
        const previous = previousPositionRef.current.get(normalizeMemberId(item.member._id)) || { x: 0, y: 0 };
        return `translate(${previous.x},${previous.y})`;
      })
      .style("opacity", 0)
      .on("click", (_event, item) => {
        const memberId = normalizeMemberId(item.member._id);
        if (memberId) {
          onFocusChange(memberId);
        }
      });

    nodeEnter
      .append("rect")
      .attr("class", "mv-node-hitbox")
      .attr("x", -(NODE_CONTENT_WIDTH / 2))
      .attr("y", -40)
      .attr("width", NODE_CONTENT_WIDTH)
      .attr("height", NODE_CONTENT_HEIGHT)
      .attr("rx", 20)
      .attr("ry", 20)
      .attr("fill", "transparent")
      .attr("stroke", "transparent")
      .attr("pointer-events", "all");

    nodeEnter
      .append("circle")
      .attr("class", "mv-node-shell")
      .attr("r", (item) => nodeRadius(item.group))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3.5)
      .attr("fill", (item) => colorByGroup[item.group])
      .attr("filter", "url(#mv-node-shadow)");

    const infoBadge = nodeEnter
      .append("g")
      .attr("class", "mv-node-info")
      .attr("transform", (item) => `translate(${nodeRadius(item.group) - 8},${-(nodeRadius(item.group) - 8)})`)
      .attr("cursor", "pointer")
      .on("click", (event, item) => {
        event.stopPropagation();
        onNodeInfo(item.member);
      });

    infoBadge
      .append("circle")
      .attr("r", 11)
      .attr("fill", "#ffffff")
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 1.4);

    infoBadge
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 12)
      .attr("font-weight", 700)
      .attr("fill", "#0f172a")
      .text("i");

    const mergedNodes = nodeEnter.merge(
      nodeSelection as unknown as d3.Selection<SVGGElement, VisualNode, SVGGElement, unknown>
    );

    renderNodeAvatar(mergedNodes);

    if (transition) {
      mergedNodes
        .select("circle.mv-node-shell")
        .transition(transition)
        .attr("fill", (item) => colorByGroup[item.group])
        .attr("r", (item) => nodeRadius(item.group));
    } else {
      mergedNodes
        .select("circle.mv-node-shell")
        .attr("fill", (item) => colorByGroup[item.group])
        .attr("r", (item) => nodeRadius(item.group));
    }

    mergedNodes
      .select("g.mv-node-info")
      .attr("transform", (item) => `translate(${nodeRadius(item.group) - 8},${-(nodeRadius(item.group) - 8)})`);

    if (transition) {
      mergedNodes
        .transition(transition)
        .style("opacity", 1)
        .attr("transform", (item) => `translate(${item.x},${item.y})`);
    } else {
      mergedNodes.style("opacity", 1).attr("transform", (item) => `translate(${item.x},${item.y})`);
    }

    if (transition) {
      nodeSelection.exit().transition().duration(200).style("opacity", 0).remove();
    } else {
      nodeSelection.exit().remove();
    }

    previousPositionRef.current = new Map(
      nodes
        .map((node) => [normalizeMemberId(node.member._id), { x: node.x, y: node.y }] as const)
        .filter(([memberId]) => Boolean(memberId))
    );

    const targetTransform = d3.zoomIdentity
      .translate(VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2)
      .scale(transformRef.current.k || 1);

    if (transition) {
      svg.transition().duration(transitionDuration + 20).call(zoomBehavior.transform, targetTransform);
    } else {
      svg.call(zoomBehavior.transform, targetTransform);
    }
  }, [bundle, graph, onFocusChange, onNodeInfo, relationLabelByNodeKey, renderNodeAvatar]);

  const handleKeyboardNavigation = (event: KeyboardEvent<HTMLDivElement>) => {
    let direction: Direction | null = null;

    if (event.key === "ArrowUp") {
      direction = "parent";
    } else if (event.key === "ArrowDown") {
      direction = "child";
    } else if (event.key === "ArrowLeft") {
      direction = "sibling";
    } else if (event.key === "ArrowRight") {
      direction = "spouse";
    }

    if (!direction) {
      return;
    }

    event.preventDefault();
    const targetId = nextFocusId(direction, bundle);
    if (targetId) {
      onFocusChange(targetId);
    }
  };

  const zoomBy = (delta: number) => {
    const zoomBehavior = zoomRef.current;
    const svgElement = svgRef.current;

    if (!zoomBehavior || !svgElement) {
      return;
    }

    d3.select(svgElement)
      .transition()
      .duration(220)
      .call(zoomBehavior.scaleBy, delta);
  };

  return (
    <div
      className="panel relative overflow-hidden"
      tabIndex={0}
      onKeyDown={handleKeyboardNavigation}
      aria-label="Interactive family tree focus canvas"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Dynamic Family Tree Engine</h2>
        <p className="text-xs text-slate-500">
          Scroll: up parent, down child, left sibling, right spouse. Ctrl+Wheel or +/- for zoom.
        </p>
      </div>

      <div className="absolute right-8 top-20 z-10 flex flex-col gap-2">
        <button type="button" className="button-secondary h-9 w-9 p-0 text-base" onClick={() => zoomBy(1.15)}>
          +
        </button>
        <button type="button" className="button-secondary h-9 w-9 p-0 text-base" onClick={() => zoomBy(0.87)}>
          -
        </button>
      </div>

      <svg ref={svgRef} className="mv-tree-svg h-[620px] w-full rounded-lg border border-slate-200 bg-slate-50" />
      <style jsx>{`
        .mv-tree-svg :global(.mv-node .mv-node-hitbox) {
          transition: fill 140ms ease;
        }
        .mv-tree-svg :global(.mv-node .mv-node-shell) {
          transition: stroke 140ms ease, stroke-width 140ms ease, filter 140ms ease;
        }
        .mv-tree-svg :global(.mv-node:hover .mv-node-hitbox) {
          fill: rgba(148, 163, 184, 0.14);
        }
        .mv-tree-svg :global(.mv-node:hover .mv-node-shell) {
          stroke: #94a3b8;
          stroke-width: 4.5px;
          filter: url(#mv-node-shadow-strong);
        }
      `}</style>
    </div>
  );
}

export default memo(FocusTreeCanvas);
