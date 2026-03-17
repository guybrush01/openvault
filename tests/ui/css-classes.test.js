import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('CSS Classes', () => {
    const _html = readFileSync(resolve(process.cwd(), 'templates/settings_panel.html'), 'utf-8');

    const css = readFileSync(resolve(process.cwd(), 'src/ui/styles.js'), 'utf-8');

    it('warning banner has red/amber border styling', () => {
        expect(css).toContain('openvault-warning-banner');
        expect(css).toContain('border-left');
    });

    it('graph stats card has styling', () => {
        expect(css).toContain('openvault-graph-stats');
    });

    it('payload calculator has color classes', () => {
        expect(css).toContain('payload-safe');
        expect(css).toContain('payload-caution');
        expect(css).toContain('payload-warning');
        expect(css).toContain('payload-danger');
    });
});
