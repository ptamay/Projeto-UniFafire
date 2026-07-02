import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { logAction } from '@/lib/logger';
import { verifySession } from '@/lib/session';
import { UserSchema } from '@/lib/schemas';

// Get all users
export async function GET() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR' && session.role !== 'PORTEIRO')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const users = db.prepare('SELECT id, username, full_name, matricula, phone, role FROM users WHERE active = 1').all();
        return NextResponse.json(users);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

// Create user
export async function POST(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const currentUser = await verifySession(sessionCookie.value);
        if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'GESTOR')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const parseResult = UserSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: parseResult.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
        }
        
        const { username, password, role, full_name, matricula, phone } = parseResult.data;

        let finalUsername = username;
        if (!finalUsername && full_name) {
            const parts = full_name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").split(/\s+/);
            const first = parts[0] || '';
            const last = parts.length > 1 ? parts[parts.length - 1] : '';

            let found = false;
            for (let i = 1; i <= first.length; i++) {
                const attempt = first.substring(0, i) + last;
                if (!db.prepare('SELECT id FROM users WHERE username = ?').get(attempt)) {
                    finalUsername = attempt;
                    found = true;
                    break;
                }
            }

            if (!found) {
                let idx = 1;
                while (true) {
                    const fallback = first.substring(0, 1) + last + idx;
                    if (!db.prepare('SELECT id FROM users WHERE username = ?').get(fallback)) {
                        finalUsername = fallback;
                        break;
                    }
                    idx++;
                }
            }
        }

        if (!finalUsername) {
            return NextResponse.json({ error: 'Nome Completo é obrigatório para gerar o usuário.' }, { status: 400 });
        }

        let finalPassword = password;
        if (!finalPassword) {
            const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'default_reset_password'").get() as { value: string } | undefined;
            finalPassword = settingsRow ? settingsRow.value : 'unifafire123';
        }

        const existing = db.prepare('SELECT id, active FROM users WHERE username = ?').get(finalUsername) as any;
        if (existing) {
            if (existing.active === 1) {
                return NextResponse.json({ error: 'Este usuário já está cadastrado e ativo' }, { status: 400 });
            } else {
                // Reactivate inactive user
                const hash = await bcrypt.hash(finalPassword, 10);
                db.prepare('UPDATE users SET active = 1, password_hash = ?, role = ?, full_name = ?, matricula = ?, phone = ?, requires_password_change = 1 WHERE id = ?')
                    .run(hash, role, full_name || null, matricula || null, phone || null, existing.id);

                logAction(currentUser.id, currentUser.username, 'REACTIVATE_USER', finalUsername, 'User reactivated with new data');

                return NextResponse.json({
                    id: existing.id, username: finalUsername, role,
                    message: 'Usuário reativado com sucesso',
                    reactivated: true
                });
            }
        }

        const hash = await bcrypt.hash(finalPassword, 10);
        const info = db.prepare('INSERT INTO users (username, password_hash, role, full_name, matricula, phone, requires_password_change) VALUES (?, ?, ?, ?, ?, ?, 1)')
            .run(finalUsername, hash, role, full_name || null, matricula || null, phone || null);

        logAction(currentUser.id, currentUser.username, 'CREATE_USER', finalUsername, `New user created with role: ${role}`);

        return NextResponse.json({ id: info.lastInsertRowid, username: finalUsername, role, full_name, matricula });
    } catch (error) {
        console.error('Create user error:', error);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}

// Delete user (soft delete)
export async function DELETE(request: Request) {
    try {
        const body = await request.json();
        const { id } = body;

        if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        if (id === session.id) {
            return NextResponse.json({ error: 'Você não pode excluir a si mesmo.' }, { status: 403 });
        }

        const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
        if (!targetUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

        if (targetUser.username === 'admin') {
            return NextResponse.json({ error: 'O usuário administrador principal do sistema (admin) não pode ser excluído por questões de segurança.' }, { status: 403 });
        }

        if (targetUser.role === 'ADMIN') {
            const result = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'").get() as any;
            if (result.count <= 1) {
                return NextResponse.json({ error: 'Não é possível excluir o único administrador.' }, { status: 403 });
            }
        }

        const info = db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
        if (info.changes === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        logAction(session.id, session.username, 'DELETE_USER', targetUser.username, `Deleted user ${targetUser.username} (${targetUser.role})`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }
}

// Update user info (PUT)
export async function PUT(request: Request) {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session || (session.role !== 'ADMIN' && session.role !== 'GESTOR')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();
        const { id, full_name, matricula, phone, role } = body;

        if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

        const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
        if (!targetUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

        if (targetUser.username === 'admin' && role && role !== 'ADMIN') {
            return NextResponse.json({ error: 'O perfil do administrador principal do sistema não pode ser rebaixado.' }, { status: 403 });
        }

        db.prepare('UPDATE users SET full_name = ?, matricula = ?, phone = ?, role = ? WHERE id = ?')
            .run(full_name || null, matricula || null, phone || null, role || targetUser.role, id);

        logAction(session.id, session.username, 'UPDATE_USER', targetUser.username, `Updated user info`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Update user error:', error);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}
