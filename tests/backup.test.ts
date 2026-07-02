import { describe, it, expect } from 'vitest';
import { register } from '../src/instrumentation';

describe('Backup Instrumentation (TASK-021)', () => {
    it('deve exportar a função register', () => {
        expect(typeof register).toBe('function');
    });
});
