import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';

// TASK-030 — imutabilidade do histórico no nível do banco (REQ-005), com bypass
// explícito de manutenção apenas para o fluxo ADMIN do REQ-014.
import { withMaintenanceMode } from '@/lib/db-maintenance';

const MIGRATION = path.resolve(process.cwd(), 'db', 'migrations', '202607021910_history_immutability.up.sql');

beforeAll(() => {
    // Aplica a migração de triggers no banco de teste (in-memory, schema do setup.ts)
    db.exec(fs.readFileSync(MIGRATION, 'utf-8'));

    // Semeia uma linha de histórico para os cenários
    db.prepare(`INSERT INTO history (key_id, user_id, username, action) VALUES (1, 1, 'test_admin', 'withdraw')`).run();
});

describe('TASK-030 — imutabilidade do histórico (REQ-005)', () => {
    it('BDD 1a: UPDATE direto em history falha com erro explícito', () => {
        expect(() => {
            db.prepare(`UPDATE history SET action = 'return' WHERE id = 1`).run();
        }).toThrow(/imutável|REQ-005/i);
    });

    it('BDD 1b: DELETE direto em history falha com erro explícito', () => {
        expect(() => {
            db.prepare(`DELETE FROM history WHERE id = 1`).run();
        }).toThrow(/imutável|REQ-005/i);
    });

    it('BDD 2: fluxo ADMIN (REQ-014) funciona via bypass explícito de manutenção', () => {
        const before = (db.prepare('SELECT COUNT(*) as c FROM history').get() as { c: number }).c;
        expect(before).toBeGreaterThan(0);

        withMaintenanceMode(() => {
            db.prepare('DELETE FROM history').run();
        });

        const after = (db.prepare('SELECT COUNT(*) as c FROM history').get() as { c: number }).c;
        expect(after).toBe(0);
    });

    it('BDD 2b: o bypass não persiste — após o fluxo ADMIN, DELETE direto volta a falhar', () => {
        db.prepare(`INSERT INTO history (key_id, user_id, username, action) VALUES (1, 1, 'test_admin', 'withdraw')`).run();
        expect(() => {
            db.prepare('DELETE FROM history').run();
        }).toThrow(/imutável|REQ-005/i);
        // Flag de manutenção não pode ter sobrado
        const flags = (db.prepare('SELECT COUNT(*) as c FROM _maintenance_mode').get() as { c: number }).c;
        expect(flags).toBe(0);
    });

    it('BDD 2c: se o fluxo ADMIN lança erro, o bypass é revertido junto (transação)', () => {
        expect(() => {
            withMaintenanceMode(() => {
                throw new Error('falha simulada');
            });
        }).toThrow('falha simulada');
        const flags = (db.prepare('SELECT COUNT(*) as c FROM _maintenance_mode').get() as { c: number }).c;
        expect(flags).toBe(0);
        // E o histórico continua protegido
        expect(() => db.prepare('DELETE FROM history').run()).toThrow(/imutável|REQ-005/i);
    });

    it('BDD 3: INSERT em history continua permitido (fluxo normal de transações)', () => {
        expect(() => {
            db.prepare(`INSERT INTO history (key_id, user_id, username, action) VALUES (1, 1, 'test_porteiro', 'return')`).run();
        }).not.toThrow();
    });
});
