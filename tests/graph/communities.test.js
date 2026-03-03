import { describe, it, expect } from 'vitest';
import { toGraphology, detectCommunities, buildCommunityGroups } from '../../src/graph/communities.js';

describe('toGraphology', () => {
    it('converts flat graph to graphology instance', () => {
        const graphData = {
            nodes: {
                'castle': { name: 'Castle', type: 'PLACE', description: 'A fortress', mentions: 1 },
                'king': { name: 'King', type: 'PERSON', description: 'The ruler', mentions: 2 },
            },
            edges: {
                'king__castle': { source: 'king', target: 'castle', description: 'Rules from', weight: 3 },
            },
        };
        const graph = toGraphology(graphData);
        expect(graph.order).toBe(2); // 2 nodes
        expect(graph.size).toBe(1); // 1 edge
        expect(graph.hasNode('castle')).toBe(true);
        expect(graph.hasNode('king')).toBe(true);
    });
});

describe('detectCommunities', () => {
    it('returns null when fewer than 3 nodes', () => {
        const graphData = {
            nodes: { a: { name: 'A' }, b: { name: 'B' } },
            edges: {},
        };
        const result = detectCommunities(graphData);
        expect(result).toBeNull();
    });

    it('detects communities in a connected graph', () => {
        // Create two clusters connected by a single weak edge
        const graphData = {
            nodes: {
                a: { name: 'A', type: 'PERSON', description: 'A', mentions: 5 },
                b: { name: 'B', type: 'PERSON', description: 'B', mentions: 5 },
                c: { name: 'C', type: 'PERSON', description: 'C', mentions: 5 },
                d: { name: 'D', type: 'PERSON', description: 'D', mentions: 5 },
                e: { name: 'E', type: 'PERSON', description: 'E', mentions: 5 },
                f: { name: 'F', type: 'PERSON', description: 'F', mentions: 5 },
            },
            edges: {
                'a__b': { source: 'a', target: 'b', description: 'friends', weight: 10 },
                'b__c': { source: 'b', target: 'c', description: 'allies', weight: 10 },
                'a__c': { source: 'a', target: 'c', description: 'team', weight: 10 },
                'd__e': { source: 'd', target: 'e', description: 'friends', weight: 10 },
                'e__f': { source: 'e', target: 'f', description: 'allies', weight: 10 },
                'd__f': { source: 'd', target: 'f', description: 'team', weight: 10 },
                'c__d': { source: 'c', target: 'd', description: 'knows', weight: 1 },
            },
        };
        const result = detectCommunities(graphData);
        expect(result).not.toBeNull();
        expect(result.communities).toBeDefined();
        expect(result.count).toBeGreaterThanOrEqual(1);
    });
});

describe('buildCommunityGroups', () => {
    it('groups nodes by community ID and formats prompt data', () => {
        const graphData = {
            nodes: {
                king: { name: 'King', type: 'PERSON', description: 'Ruler', mentions: 3 },
                castle: { name: 'Castle', type: 'PLACE', description: 'Fortress', mentions: 2 },
                tavern: { name: 'Tavern', type: 'PLACE', description: 'A pub', mentions: 1 },
            },
            edges: {
                'king__castle': { source: 'king', target: 'castle', description: 'Rules from', weight: 4 },
            },
        };
        const partition = { king: 0, castle: 0, tavern: 1 };
        const groups = buildCommunityGroups(graphData, partition);

        expect(Object.keys(groups)).toHaveLength(2);
        expect(groups[0].nodeKeys).toContain('king');
        expect(groups[0].nodeKeys).toContain('castle');
        expect(groups[0].nodeLines.length).toBeGreaterThan(0);
        expect(groups[1].nodeKeys).toContain('tavern');
    });
});
