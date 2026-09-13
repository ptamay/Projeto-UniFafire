import { it, expect } from 'vitest';

// TASK-122 — FALHA PLANTADA, revertida no commit seguinte. Prova que um teste vermelho
// deixa o check do CI vermelho.
it('PROVA TASK-122: a vitest reprova o check', () => {
    expect(1).toBe(2);
});
