import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execute, withTransaction } from '@/lib/pg';
import {
    AUTO_LOGOUT_PADRAO,
    lerAutoLogoutTime, cruzouOHorario,
} from '@/lib/settings-policy';

// TASK-083 (Sprint 24 · CR Tipo C, ADR-013 decisões 3 e 4) — 🔴 crítica: toca
// controle de sessão e senha padrão. constitution §2.
//
// ## O defeito, medido em produção
//
// `settings.auto_logout_time` vale `"30"`. O `Sidebar` compara a hora corrente
// (`"14:35"`) com esse valor; a igualdade nunca acontece e **o logout automático
// nunca dispara**. O `<input type="time">` da tela também não consegue exibir
// `"30"`, então o campo aparece vazio — e quem olha conclui que a configuração
// está em branco, não que está inválida.
//
// O valor veio da carga sintética da TASK-067, preservada na limpeza do go-live.
//
// ## Por que validar na LEITURA, e não só na escrita
//
// O `POST` já valida por schema (`HH:MM`). Isso protege o que entra a partir de
// agora e **não protege nada do que já está lá**. Um valor herdado — de um seed,
// de uma migração, de uma versão anterior do schema — atravessa a validação de
// escrita por baixo, porque nunca passou por ela. Validação só na fronteira de
// entrada assume que a fronteira sempre existiu.
//
// ## O segundo defeito: dois padrões para a mesma senha
//
// `GET /api/settings` devolvia `'saojose123'` na ausência do registro; as rotas
// que APLICAM a senha usavam `'unifafire123'`. O ADMIN leria uma na tela e o
// sistema aplicaria outra. E `'saojose'` é o nome antigo do projeto — anterior ao
// próprio UniFafire.

const RAIZ = process.cwd();

function semComentarios(arquivo: string) {
    return fs.readFileSync(path.resolve(RAIZ, arquivo), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

beforeEach(async () => {
    await execute('DELETE FROM settings');
});

describe('TASK-083 — valor inválido herdado não quebra mais o logout', () => {
    it('BDD 1: `"30"` — o valor real de produção — não passa', () => {
        expect(lerAutoLogoutTime('30'), 'o valor que quebrou o logout foi aceito')
            .toBe(AUTO_LOGOUT_PADRAO);
    });

    it('BDD 1: outras formas inválidas caem no padrão', () => {
        for (const invalido of ['', '  ', '25:00', '18:60', 'abc', '1830', '18:3', null, undefined]) {
            expect(lerAutoLogoutTime(invalido as never), `aceitou "${invalido}"`)
                .toBe(AUTO_LOGOUT_PADRAO);
        }
    });

    it('BDD 1: horário válido é preservado', () => {
        expect(lerAutoLogoutTime('18:30')).toBe('18:30');
        expect(lerAutoLogoutTime('00:00')).toBe('00:00');
        expect(lerAutoLogoutTime('23:59')).toBe('23:59');
    });

    it('BDD 1: a rota devolve o padrão quando o banco tem lixo', async () => {
        await withTransaction(async (tx) => {
            await tx.execute(
                `INSERT INTO settings (key, value) VALUES ('auto_logout_time', '30')
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
            );
        });

        vi.resetModules();
        vi.doMock('next/headers', () => ({
            cookies: () => Promise.resolve({ get: () => ({ value: 'token' }) }),
        }));
        vi.doMock('@/lib/session', () => ({
            verifySession: () => Promise.resolve({ id: 3, username: 'test_porteiro', role: 'PORTEIRO' }),
        }));
        const { GET } = await import('@/app/api/settings/route');
        const corpo = await (await GET()).json();

        // PORTEIRO de proposito: `autoLogoutTime` vale para TODO papel, e a
        // TASK-087 nao pode ter estreitado isso.
        expect(corpo.autoLogoutTime, 'a rota repassou o lixo do banco para a tela')
            .toBe(AUTO_LOGOUT_PADRAO);
    });
});

describe('TASK-083 — o logout dispara em vez de depender de um minuto exato', () => {
    // A comparação era `agora === alvo`, verificada a cada 60 s. Um tick atrasado
    // — e navegadores estrangulam timers em aba de fundo — pula o minuto e o
    // logout não acontece naquele dia. Igualdade sobre um alvo móvel é frágil por
    // construção.
    it('BDD 1: dispara ao CRUZAR o horário, não ao coincidir com ele', () => {
        expect(cruzouOHorario('18:29', '18:30', '18:30'), 'não disparou no minuto exato').toBe(true);
        expect(cruzouOHorario('18:29', '18:34', '18:30'), 'perdeu o tick e não disparou').toBe(true);
    });

    it('BDD 1: não dispara antes, nem repete depois de já ter cruzado', () => {
        expect(cruzouOHorario('18:00', '18:29', '18:30'), 'disparou antes da hora').toBe(false);
        expect(cruzouOHorario('18:31', '18:32', '18:30'), 'disparou de novo depois de já ter cruzado').toBe(false);
    });

    it('BDD 1: quem entra DEPOIS do horário não é expulso na hora', () => {
        // Trocar a igualdade por `agora >= alvo` puro tornaria o sistema
        // inutilizável após o horário: qualquer login noturno cairia fora
        // imediatamente. A borda é o cruzamento, não a comparação.
        expect(cruzouOHorario('20:00', '20:01', '18:30')).toBe(false);
    });

    it('BDD 1: o Sidebar limpa o intervalo que cria', () => {
        // O `return () => clearInterval(...)` estava dentro da função ASYNC, não
        // no corpo do efeito — nunca virou cleanup. Cada montagem deixava um
        // intervalo vivo para sempre.
        const fonte = semComentarios('src/app/components/Sidebar.tsx');
        // Mira o EFEITO devolvendo um cleanup que limpa — não uma única forma de
        // escrevê-lo. O defeito era o `clearInterval` estar fora do caminho de
        // retorno do efeito, não a quantidade de linhas.
        expect(fonte, 'o efeito não devolve cleanup do intervalo')
            .toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]*?clearInterval/);
    });
});

describe('TASK-083 — a senha padrão de reset tem UMA fonte', () => {
    it('BDD 3: nenhum literal de senha padrão espalhado pelo código', () => {
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const rel = path.relative(RAIZ, p).split(path.sep).join('/');
                    if (rel === 'src/lib/settings-policy.ts') continue;
                    if (/'(saojose123|unifafire123)'/.test(semComentarios(rel))) achados.push(rel);
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `literal de senha fora da fonte única:\n${achados.join('\n')}`).toEqual([]);
    });

    it('BDD 3: `saojose123` não existe mais em lugar nenhum — nem o nome antigo do projeto', () => {
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name) && semComentarios(path.relative(RAIZ, p).split(path.sep).join('/')).includes('saojose')) {
                    achados.push(path.relative(RAIZ, p));
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `nome antigo do projeto ainda presente:\n${achados.join('\n')}`).toEqual([]);
    });

    // O cenário "o ADMIN lê na tela a senha que o sistema realmente aplica"
    // MORREU na TASK-094 (ADR-017), e não por ter ficado chato: **o objeto dele
    // deixou de existir**. Não há mais senha compartilhada para a tela e o sistema
    // concordarem sobre — o reset emite código de uso único.
    //
    // O que ele protegia — dois caminhos lendo valores diferentes — está protegido
    // de forma mais forte pelo cenário abaixo, que proíbe o conceito inteiro, e por
    // `tests/senha-compartilhada-sai.test.ts`, que exige que NENHUM papel receba o
    // campo. Apagar sem esta nota faria parecer que a divergência da TASK-083
    // deixou de importar; ela deixou de ser POSSÍVEL.

    it('BDD 4: NENHUMA rota aplica mais uma senha padrão compartilhada', () => {
        // Esta guarda INVERTEU de sentido na TASK-093 (ADR-017), e a inversão é o
        // registro do que mudou: antes ela exigia que as duas rotas lessem a MESMA
        // senha padrão, porque o defeito da TASK-083 era haver duas fontes
        // divergindo. Agora não pode haver fonte nenhuma — a senha compartilhada
        // deixou de ser aplicada em qualquer lugar.
        //
        // Não é a mesma afirmação com o sinal trocado: a antiga admitia o conceito
        // e exigia consistência; esta nega o conceito. Deixá-la como estava, só
        // com menos rotas na lista, a tornaria vácua — que é como uma guarda morre
        // sem ninguém notar.
        for (const rota of ['src/app/api/users/route.ts', 'src/app/api/users/reset-password/route.ts']) {
            expect(semComentarios(rota), `${rota} ainda aplica a senha padrão compartilhada`)
                .not.toMatch(/SENHA_PADRAO_RESET/);
        }
    });
});
