/**
 * OpenVault Community Detection & Summarization
 *
 * Uses graphology for graph computation and Louvain for community detection.
 */

import Graph from 'https://esm.sh/graphology@0.25.4';
import louvain from 'https://esm.sh/graphology-communities-louvain@0.12.0';
import { toUndirected } from 'https://esm.sh/graphology-operators@1.6.0';

/**
 * Convert flat graph data to a graphology instance.
 * @param {Object} graphData - { nodes, edges } from chatMetadata
 * @returns {Graph}
 */
export function toGraphology(graphData) {
    const graph = new Graph({ type: 'directed', allowSelfLoops: false });

    for (const [key, attrs] of Object.entries(graphData.nodes || {})) {
        graph.addNode(key, { ...attrs });
    }

    for (const [key, attrs] of Object.entries(graphData.edges || {})) {
        if (graph.hasNode(attrs.source) && graph.hasNode(attrs.target)) {
            graph.addEdgeWithKey(key, attrs.source, attrs.target, {
                description: attrs.description,
                weight: attrs.weight || 1,
            });
        }
    }

    return graph;
}

/**
 * Run Louvain community detection on the graph.
 * @param {Object} graphData - Flat graph data
 * @returns {{ communities: Object<string, number>, count: number } | null}
 */
export function detectCommunities(graphData) {
    if (Object.keys(graphData.nodes || {}).length < 3) return null;

    const directed = toGraphology(graphData);
    const undirected = toUndirected(directed);

    const details = louvain.detailed(undirected, {
        getEdgeWeight: 'weight',
        resolution: 1.0,
    });

    return {
        communities: details.communities,
        count: details.count,
    };
}

/**
 * Group nodes by community ID and extract subgraph data for LLM prompts.
 * @param {Object} graphData - Flat graph data
 * @param {Object} communityPartition - nodeKey → communityId mapping
 * @returns {Object<number, { nodeKeys: string[], nodeLines: string[], edgeLines: string[] }>}
 */
export function buildCommunityGroups(graphData, communityPartition) {
    const groups = {};

    // Group node keys
    for (const [nodeKey, communityId] of Object.entries(communityPartition)) {
        if (!groups[communityId]) {
            groups[communityId] = { nodeKeys: [], nodeLines: [], edgeLines: [] };
        }
        groups[communityId].nodeKeys.push(nodeKey);

        const node = graphData.nodes[nodeKey];
        if (node) {
            groups[communityId].nodeLines.push(
                `- ${node.name} (${node.type || 'UNKNOWN'}): ${node.description}`
            );
        }
    }

    // Assign edges to communities
    for (const [edgeKey, edge] of Object.entries(graphData.edges || {})) {
        const srcCommunity = communityPartition[edge.source];
        const tgtCommunity = communityPartition[edge.target];

        // Include edge if both endpoints are in the same community
        if (srcCommunity === tgtCommunity && groups[srcCommunity]) {
            const srcNode = graphData.nodes[edge.source];
            const tgtNode = graphData.nodes[edge.target];
            groups[srcCommunity].edgeLines.push(
                `- ${srcNode?.name || edge.source} → ${tgtNode?.name || edge.target}: ${edge.description} [weight: ${edge.weight}]`
            );
        }
    }

    return groups;
}
