import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('Setting Descriptions', () => {
    const html = readFileSync(resolve(process.cwd(), 'templates/settings_panel.html'), 'utf-8');

    it('has updated Extraction Batch Size description', () => {
        expect(html).toContain('How much chat history to send');
        expect(html).toContain('fewer API calls but longer waits');
    });

    it('has updated Context Window Size description', () => {
        expect(html).toContain('How far back the AI reads');
        expect(html).toContain('better context, but costs more tokens');
    });

    it('has updated Reflection Threshold description', () => {
        expect(html).toContain('interesting stuff');
        expect(html).toContain('Lower = more frequent insights');
    });

    // Quick Toggles don't have descriptions - they're minimal by design
    it('has Auto-hide Messages in Quick Toggles', () => {
        expect(html).toContain('Auto-hide Messages');
        expect(html).toContain('openvault_auto_hide');
    });

    it('has updated Alpha description', () => {
        expect(html).toContain('find similar meaning');
        expect(html).toContain('find exact words');
    });

    it('has updated Lambda description', () => {
        expect(html).toContain('How quickly old memories fade');
        expect(html).toContain('Default 0.05 is highly recommended');
    });
});
