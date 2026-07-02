import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PWA Support (TASK-017)', () => {
    it('should have a manifest.json file', () => {
        const manifestPath = path.resolve(__dirname, '../public/manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);
    });
});
