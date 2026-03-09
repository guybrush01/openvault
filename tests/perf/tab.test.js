import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('perf tab HTML', () => {
    const html = readFileSync(resolve(__dirname, '../../templates/settings_panel.html'), 'utf-8');

    it('has a 5th tab button for perf', () => {
        expect(html).toContain('data-tab="perf"');
    });

    it('has the perf tab content container', () => {
        expect(html).toContain('openvault-tab-content" data-tab="perf"');
    });

    it('has the perf table container', () => {
        expect(html).toContain('id="openvault_perf_table"');
    });

    it('has the clipboard copy button', () => {
        expect(html).toContain('id="openvault_copy_perf_btn"');
    });
});

describe('perf tab CSS', () => {
    const css = readFileSync(resolve(__dirname, '../../css/perf.css'), 'utf-8');

    it('has the perf table base class', () => {
        expect(css).toContain('.openvault-perf-table');
    });

    it('has green and red health indicator classes', () => {
        expect(css).toContain('.openvault-perf-ok');
        expect(css).toContain('.openvault-perf-warn');
    });
});
