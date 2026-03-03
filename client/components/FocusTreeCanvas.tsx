"use client";

import { KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Member, MemberWithRelationsResponse } from "@/types";

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
  diameter: number;
  radius: number;
  initialFontSize: number;
  clipPathId: string;
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
const FOCUS_AVATAR_DIAMETER = 58;
const NODE_AVATAR_DIAMETER = 50;
const AVATAR_BORDER_COLOR = "#cbd5e1";
const AVATAR_TEXT_COLOR = "#334155";
const AVATAR_FOCUS_CLIP_ID = "mv-avatar-clip-focus";
const AVATAR_NODE_CLIP_ID = "mv-avatar-clip-node";
const UPLOADS_BASE_URL = (process.env.NEXT_PUBLIC_UPLOADS_URL ?? "http://localhost:5000").replace(/\/+$/, "");

const colorByGroup: Record<RelationGroup, string> = {
  focus: "#1d4ed8",
  father: "#2563eb",
  mother: "#7c3aed",
  spouse: "#0f766e",
  child: "#0891b2",
  sibling: "#475569"
};

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

  switch (direction) {
    case "parent":
      return bundle.relations.father?._id || bundle.relations.mother?._id || null;
    case "child":
      return bundle.relations.children[0]?._id || null;
    case "sibling":
      return bundle.relations.siblings[0]?._id || null;
    case "spouse":
      return bundle.relations.spouses[0]?._id || null;
    default:
      return null;
  }
}

function buildVisualGraph(bundle: MemberWithRelationsResponse | null): { nodes: VisualNode[]; links: VisualLink[] } {
  if (!bundle) {
    return { nodes: [], links: [] };
  }

  const nodes = new Map<string, VisualNode>();
  const links: VisualLink[] = [];

  const setNode = (member: Member, group: RelationGroup, x: number, y: number) => {
    if (!nodes.has(member._id)) {
      nodes.set(member._id, {
        key: member._id,
        member,
        x,
        y,
        group
      });
      return;
    }

    if (group === "focus") {
      nodes.set(member._id, {
        key: member._id,
        member,
        x,
        y,
        group
      });
    }
  };

  const focus = bundle.focus;
  setNode(focus, "focus", 0, 0);

  if (bundle.relations.father) {
    setNode(bundle.relations.father, "father", -150, -220);
    links.push({
      key: `father-${bundle.relations.father._id}`,
      sourceId: focus._id,
      targetId: bundle.relations.father._id,
      group: "father"
    });
  }

  if (bundle.relations.mother) {
    setNode(bundle.relations.mother, "mother", 150, -220);
    links.push({
      key: `mother-${bundle.relations.mother._id}`,
      sourceId: focus._id,
      targetId: bundle.relations.mother._id,
      group: "mother"
    });
  }

  const visibleSpouses = bundle.relations.spouses.slice(0, MAX_RENDERED_SPOUSES);
  const spouseOffsets = spread(visibleSpouses.length, 120);
  visibleSpouses.forEach((member, index) => {
    setNode(member, "spouse", 330, spouseOffsets[index] ?? 0);
    links.push({
      key: `spouse-${member._id}`,
      sourceId: focus._id,
      targetId: member._id,
      group: "spouse"
    });
  });

  const visibleSiblings = bundle.relations.siblings.slice(0, MAX_RENDERED_SIBLINGS);
  const siblingOffsets = spread(visibleSiblings.length, 120);
  visibleSiblings.forEach((member, index) => {
    setNode(member, "sibling", -330, siblingOffsets[index] ?? 0);
    links.push({
      key: `sibling-${member._id}`,
      sourceId: focus._id,
      targetId: member._id,
      group: "sibling"
    });
  });

  const visibleChildren = bundle.relations.children.slice(0, MAX_RENDERED_CHILDREN);
  const childOffsets = spread(visibleChildren.length, 170);
  visibleChildren.forEach((member, index) => {
    setNode(member, "child", childOffsets[index] ?? 0, 240);
    links.push({
      key: `child-${member._id}`,
      sourceId: focus._id,
      targetId: member._id,
      group: "child"
    });
  });

  return {
    nodes: Array.from(nodes.values()),
    links
  };
}

function clipName(name: string): string {
  if (name.length <= 18) {
    return name;
  }

  return `${name.slice(0, 17)}...`;
}

function relationSubtitle(node: VisualNode): string {
  switch (node.group) {
    case "father":
      return "Father";
    case "mother":
      return "Mother";
    case "spouse":
      return "Spouse";
    case "child":
      if (node.member.gender === "male") {
        return "Son";
      }
      if (node.member.gender === "female") {
        return "Daughter";
      }
      return "Child";
    case "sibling":
      if (node.member.gender === "male") {
        return "Brother";
      }
      if (node.member.gender === "female") {
        return "Sister";
      }
      return "Sibling";
    case "focus":
    default:
      return "Self";
  }
}

function relationBadgeWidth(label: string): number {
  return Math.max(58, Math.min(132, label.length * 6 + 18));
}

function nodeRadius(group: RelationGroup): number {
  return group === "focus" ? 50 : 38;
}

function avatarDiameter(group: RelationGroup): number {
  return group === "focus" ? FOCUS_AVATAR_DIAMETER : NODE_AVATAR_DIAMETER;
}

function avatarClipPathId(group: RelationGroup): string {
  return group === "focus" ? AVATAR_FOCUS_CLIP_ID : AVATAR_NODE_CLIP_ID;
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

function resolveProfileImageUrl(profileImage?: string | null): string | null {
  const normalizedPath = String(profileImage || "").trim();
  if (!normalizedPath) {
    return null;
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith("/")) {
    return `${UPLOADS_BASE_URL}${normalizedPath}`;
  }

  return `${UPLOADS_BASE_URL}/${normalizedPath}`;
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

  const graph = useMemo(() => buildVisualGraph(bundle), [bundle]);
  const displayNameByNodeKey = useMemo(() => {
    const labels = new Map<string, string>();
    for (const node of graph.nodes) {
      labels.set(node.key, clipName(node.member.name));
    }
    return labels;
  }, [graph.nodes]);
  const relationLabelByNodeKey = useMemo(() => {
    const labels = new Map<string, string>();
    for (const node of graph.nodes) {
      labels.set(node.key, relationSubtitle(node));
    }
    return labels;
  }, [graph.nodes]);
  const avatarConfigByMemberId = useMemo(() => {
    const map = new Map<string, AvatarConfig>();

    for (const node of graph.nodes) {
      const imageUrl = resolveProfileImageUrl(node.member.profileImage);
      const availableImageUrl = imageUrl && !failedImageUrls.has(imageUrl) ? imageUrl : null;
      const diameter = avatarDiameter(node.group);
      map.set(node.member._id, {
        imageUrl: availableImageUrl,
        fallbackColor: avatarFallbackColor(node.member),
        initial: firstLetter(node.member.name),
        diameter,
        radius: diameter / 2,
        initialFontSize: node.group === "focus" ? 20 : 16,
        clipPathId: avatarClipPathId(node.group)
      });
    }

    return map;
  }, [failedImageUrls, graph.nodes]);

  const renderNodeAvatar = useCallback(
    (selection: d3.Selection<SVGGElement, VisualNode, SVGGElement, unknown>) => {
      selection.each(function (item) {
        const avatarConfig = avatarConfigByMemberId.get(item.member._id);
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
                .insert("g", "text.mv-node-name")
                .attr("class", "mv-node-avatar")
                .style("pointer-events", "none"),
            (update) => update
          );

        avatarGroup
          .selectAll<SVGCircleElement, AvatarConfig>("circle.mv-avatar-bg")
          .data([avatarConfig])
          .join("circle")
          .attr("class", "mv-avatar-bg")
          .attr("r", (datum) => datum.radius)
          .attr("fill", (datum) => datum.fallbackColor);

        avatarGroup
          .selectAll<SVGImageElement, string>("image.mv-avatar-image")
          .data(avatarConfig.imageUrl ? [avatarConfig.imageUrl] : [], (datum) => datum)
          .join(
            (enter) =>
              enter
                .append("image")
                .attr("class", "mv-avatar-image")
                .style("pointer-events", "none")
                .on("error", function (_event, imageUrl) {
                  if (imageUrl) {
                    setFailedImageUrls((current) => {
                      if (current.has(imageUrl)) {
                        return current;
                      }

                      const next = new Set(current);
                      next.add(imageUrl);
                      return next;
                    });
                  }

                  d3.select(this).remove();
                  avatarGroup.select("text.mv-avatar-initial").style("opacity", 1);
                }),
            (update) => update,
            (exit) => exit.remove()
          )
          .attr("href", (datum) => datum)
          .attr("xlink:href", (datum) => datum)
          .attr("x", -avatarConfig.radius)
          .attr("y", -avatarConfig.radius)
          .attr("width", avatarConfig.diameter)
          .attr("height", avatarConfig.diameter)
          .attr("clip-path", `url(#${avatarConfig.clipPathId})`)
          .attr("preserveAspectRatio", "xMidYMid slice");

        avatarGroup
          .selectAll<SVGCircleElement, AvatarConfig>("circle.mv-avatar-ring")
          .data([avatarConfig])
          .join("circle")
          .attr("class", "mv-avatar-ring")
          .attr("r", (datum) => datum.radius)
          .attr("fill", "none")
          .attr("stroke", AVATAR_BORDER_COLOR)
          .attr("stroke-width", 1.3);

        avatarGroup
          .selectAll<SVGTextElement, AvatarConfig>("text.mv-avatar-initial")
          .data([avatarConfig])
          .join("text")
          .attr("class", "mv-avatar-initial")
          .attr("text-anchor", "middle")
          .attr("dy", (datum) => (datum.radius > 27 ? 7 : 6))
          .attr("font-size", (datum) => datum.initialFontSize)
          .attr("font-weight", 700)
          .attr("fill", AVATAR_TEXT_COLOR)
          .style("opacity", (datum) => (datum.imageUrl ? 0 : 1))
          .text((datum) => datum.initial);
      });
    },
    [avatarConfigByMemberId]
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
    defs
      .append("clipPath")
      .attr("id", AVATAR_FOCUS_CLIP_ID)
      .attr("clipPathUnits", "userSpaceOnUse")
      .append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", FOCUS_AVATAR_DIAMETER / 2);
    defs
      .append("clipPath")
      .attr("id", AVATAR_NODE_CLIP_ID)
      .attr("clipPathUnits", "userSpaceOnUse")
      .append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", NODE_AVATAR_DIAMETER / 2);

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
    const positionMap = new Map(nodes.map((node) => [node.member._id, { x: node.x, y: node.y }]));
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
        const previous = previousPositionRef.current.get(item.member._id) || { x: 0, y: 0 };
        return `translate(${previous.x},${previous.y})`;
      })
      .style("opacity", 0)
      .on("click", (_event, item) => {
        onFocusChange(item.member._id);
      });

    nodeEnter
      .append("circle")
      .attr("class", "mv-node-shell")
      .attr("r", (item) => nodeRadius(item.group))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3.5)
      .attr("fill", (item) => colorByGroup[item.group])
      .attr("filter", "url(#mv-node-shadow)");

    nodeEnter
      .append("text")
      .attr("class", "mv-node-name")
      .attr("text-anchor", "middle")
      .attr("dy", 72)
      .attr("font-size", 13)
      .attr("font-weight", 700)
      .attr("fill", "#0f172a")
      .text((item) => displayNameByNodeKey.get(item.key) || clipName(item.member.name));

    const relationBadge = nodeEnter
      .append("g")
      .attr("class", "mv-node-relation-badge")
      .attr("transform", "translate(0,88)");

    relationBadge
      .append("rect")
      .attr("class", "mv-node-relation-bg")
      .attr("x", (item) => {
        const label = relationLabelByNodeKey.get(item.key) || relationSubtitle(item);
        return -(relationBadgeWidth(label) / 2);
      })
      .attr("y", -8)
      .attr("width", (item) => {
        const label = relationLabelByNodeKey.get(item.key) || relationSubtitle(item);
        return relationBadgeWidth(label);
      })
      .attr("height", 16)
      .attr("rx", 8)
      .attr("ry", 8)
      .attr("fill", "#f8fafc")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1);

    relationBadge
      .append("text")
      .attr("class", "mv-node-relation")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 10)
      .attr("font-weight", 500)
      .attr("fill", "#64748b")
      .text((item) => relationLabelByNodeKey.get(item.key) || relationSubtitle(item));

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
      .select("text.mv-node-name")
      .text((item) => displayNameByNodeKey.get(item.key) || clipName(item.member.name));

    mergedNodes
      .select("text.mv-node-relation")
      .text((item) => relationLabelByNodeKey.get(item.key) || relationSubtitle(item));

    mergedNodes
      .select("rect.mv-node-relation-bg")
      .attr("x", (item) => {
        const label = relationLabelByNodeKey.get(item.key) || relationSubtitle(item);
        return -(relationBadgeWidth(label) / 2);
      })
      .attr("width", (item) => {
        const label = relationLabelByNodeKey.get(item.key) || relationSubtitle(item);
        return relationBadgeWidth(label);
      });

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

    previousPositionRef.current = new Map(nodes.map((node) => [node.member._id, { x: node.x, y: node.y }]));

    const targetTransform = d3.zoomIdentity
      .translate(VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2)
      .scale(transformRef.current.k || 1);

    if (transition) {
      svg.transition().duration(transitionDuration + 20).call(zoomBehavior.transform, targetTransform);
    } else {
      svg.call(zoomBehavior.transform, targetTransform);
    }
  }, [bundle, displayNameByNodeKey, graph, onFocusChange, onNodeInfo, relationLabelByNodeKey, renderNodeAvatar]);

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
        .mv-tree-svg :global(.mv-node) {
          transform-box: fill-box;
          transform-origin: center;
          transition: transform 140ms ease;
        }
        .mv-tree-svg :global(.mv-node .mv-node-shell) {
          transition: stroke 140ms ease, stroke-width 140ms ease, filter 140ms ease;
        }
        .mv-tree-svg :global(.mv-node .mv-node-name) {
          transition: fill 140ms ease;
        }
        .mv-tree-svg :global(.mv-node:hover) {
          transform: scale(1.02);
        }
        .mv-tree-svg :global(.mv-node:hover .mv-node-shell) {
          stroke: #94a3b8;
          stroke-width: 4.5px;
          filter: url(#mv-node-shadow-strong);
        }
        .mv-tree-svg :global(.mv-node:hover .mv-node-name) {
          fill: #020617;
        }
      `}</style>
    </div>
  );
}

export default memo(FocusTreeCanvas);
