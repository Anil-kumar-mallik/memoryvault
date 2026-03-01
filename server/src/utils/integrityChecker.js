const FamilyTree = require("../models/FamilyTree");
const Member = require("../models/Member");

const normalizeId = (value) => (value ? String(value) : null);

const uniqueIds = (values) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(new Set(values.map((value) => normalizeId(value)).filter(Boolean)));
};

const findDuplicates = (values) => {
  const counts = new Map();
  for (const value of values || []) {
    const id = normalizeId(value);
    if (!id) {
      continue;
    }
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
};

const addBrokenReference = (bucket, { tree, member, field, invalidIds, reason }) => {
  bucket.push({
    treeId: String(tree._id),
    treeName: tree.name,
    memberId: String(member._id),
    memberName: member.name,
    field,
    invalidIds: uniqueIds(invalidIds),
    reason
  });
};

const analyzeSpouseCycles = ({ tree, members, issueBucket }) => {
  const memberMap = new Map(members.map((member) => [String(member._id), member]));
  const adjacency = new Map();

  for (const member of members) {
    const memberId = String(member._id);
    if (!adjacency.has(memberId)) {
      adjacency.set(memberId, new Set());
    }

    const spouseIds = uniqueIds(member.spouses);
    for (const spouseId of spouseIds) {
      if (!memberMap.has(spouseId) || spouseId === memberId) {
        continue;
      }

      if (!adjacency.has(spouseId)) {
        adjacency.set(spouseId, new Set());
      }

      adjacency.get(memberId).add(spouseId);
      adjacency.get(spouseId).add(memberId);
    }
  }

  const visited = new Set();
  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) {
      continue;
    }

    const queue = [startId];
    const componentIds = [];
    let edgeTwiceCount = 0;

    visited.add(startId);
    while (queue.length > 0) {
      const current = queue.shift();
      componentIds.push(current);
      const neighbors = adjacency.get(current) || new Set();
      edgeTwiceCount += neighbors.size;

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const edgeCount = edgeTwiceCount / 2;
    if (componentIds.length >= 3 && edgeCount >= componentIds.length) {
      issueBucket.push({
        treeId: String(tree._id),
        treeName: tree.name,
        memberIds: componentIds,
        memberCount: componentIds.length,
        edgeCount
      });
    }
  }
};

const runIntegrityCheck = async ({ treeId = null } = {}) => {
  const treeFilter = treeId ? { _id: treeId } : {};
  const trees = await FamilyTree.find(treeFilter).select("_id name").lean();

  const report = {
    generatedAt: new Date().toISOString(),
    scope: treeId ? { treeId: String(treeId) } : { treeId: null, mode: "all-trees" },
    summary: {
      treesScanned: trees.length,
      membersScanned: 0,
      brokenReferences: 0,
      circularSpouseLoops: 0,
      duplicateRelationshipEntries: 0
    },
    issues: {
      brokenReferences: [],
      circularSpouseLoops: [],
      duplicateRelationshipEntries: []
    }
  };

  for (const tree of trees) {
    const members = await Member.find({ treeId: tree._id })
      .select("_id name fatherId motherId spouses children siblings")
      .lean();
    report.summary.membersScanned += members.length;

    const memberIds = new Set(members.map((member) => String(member._id)));

    for (const member of members) {
      const memberId = String(member._id);
      const fatherId = normalizeId(member.fatherId);
      const motherId = normalizeId(member.motherId);

      if (fatherId && (!memberIds.has(fatherId) || fatherId === memberId)) {
        addBrokenReference(report.issues.brokenReferences, {
          tree,
          member,
          field: "fatherId",
          invalidIds: [fatherId],
          reason: fatherId === memberId ? "self-reference" : "missing-target-member"
        });
      }

      if (motherId && (!memberIds.has(motherId) || motherId === memberId)) {
        addBrokenReference(report.issues.brokenReferences, {
          tree,
          member,
          field: "motherId",
          invalidIds: [motherId],
          reason: motherId === memberId ? "self-reference" : "missing-target-member"
        });
      }

      for (const field of ["spouses", "children", "siblings"]) {
        const relationIds = (member[field] || []).map((value) => normalizeId(value)).filter(Boolean);
        const duplicates = findDuplicates(relationIds);
        if (duplicates.length) {
          report.issues.duplicateRelationshipEntries.push({
            treeId: String(tree._id),
            treeName: tree.name,
            memberId,
            memberName: member.name,
            field,
            duplicateIds: duplicates
          });
        }

        const invalidIds = uniqueIds(
          relationIds.filter((relationId) => relationId === memberId || !memberIds.has(relationId))
        );
        if (invalidIds.length) {
          addBrokenReference(report.issues.brokenReferences, {
            tree,
            member,
            field,
            invalidIds,
            reason: "missing-or-self-reference"
          });
        }
      }
    }

    analyzeSpouseCycles({
      tree,
      members,
      issueBucket: report.issues.circularSpouseLoops
    });
  }

  report.summary.brokenReferences = report.issues.brokenReferences.length;
  report.summary.circularSpouseLoops = report.issues.circularSpouseLoops.length;
  report.summary.duplicateRelationshipEntries = report.issues.duplicateRelationshipEntries.length;

  return report;
};

module.exports = runIntegrityCheck;
