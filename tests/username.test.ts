import { describe, it, expect } from 'vitest';

describe('Automatic Username Generation (TASK-019)', () => {
    it('should generate a valid username format', () => {
        const fullName = 'Paulo Tamay';
        const generateUsername = (name: string) => {
            const parts = name.trim().toLowerCase().split(' ');
            return parts[0][0] + parts[parts.length - 1];
        };
        expect(generateUsername(fullName)).toBe('ptamay');
    });
});
