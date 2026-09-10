import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-097 (CR Tipo C · ADR-018) — a tela de Configurações reequilibrada.
//
// ## Por que agora
//
// Não é estética solta. A TASK-094 removeu o campo "Senha Padrão de Reset", e o card
// "Sistema e Segurança" ficou com **um item só**. A tela passou por duas remoções
// seguidas (ADR-013 tirou quatro controles inertes; ADR-017 tirou a senha) e o que
// sobrou não é um arranjo — é o resto de dois arranjos anteriores.
//
// ## As três mudanças, e o que cada uma resolve
//
// 1. **Estado da atualização em tempo real.** É a resposta para "por que a tela
//    demorou a mudar" — a pergunta que o porteiro faz quando o balcão parece
//    desatualizado. Hoje o sistema sabe (`EstadoSinal`: assinado ou polling largo de
//    30 s) e não conta a ninguém.
// 2. **Zona destrutiva separada.** "Limpar Banco de Dados" é um botão vermelho no
//    meio da grade, com o MESMO PESO VISUAL de um campo de horário. Ação
//    irreversível não divide espaço com preferência.
// 3. O card de configurações deixa de ser um campo perdido num cartão.
//
// ## O que NÃO entra, e o registro existe para não ser reintroduzido
//
// Painel de sistema: versão, host, uptime, contagens, região. A TASK-079 removeu
// `/api/server-info` exatamente por isso — cada campo é reconhecimento gratuito para
// quem procura o que atacar, e esta tela é acessível a ADMIN e GESTOR.
//
// ## O botão de "rever tutorial" também NÃO entra ainda
//
// O ADR-018 o listou nesta task. Mas a TASK-098 (o tutorial) não existe, e um botão
// que abre coisa nenhuma é precisamente a mentira em tela que o ADR-013 veio
// combater. Ele entra JUNTO com o tutorial, não antes.

const RAIZ = process.cwd();
const TELA = 'src/app/settings/SettingsClient.tsx';

const semComentarios = (f: string) =>
    fs.readFileSync(path.resolve(RAIZ, f), 'utf-8')
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

describe('TASK-097 — a tela conta o que o sistema sabe', () => {
    it('BDD 1: mostra o estado da atualização em tempo real', () => {
        const fonte = semComentarios(TELA);
        expect(fonte, 'a tela não exibe o estado do sinal')
            .toMatch(/EstadoSinal|estadoDoSinal|useEstadoDoSinal/);
    });

    it('BDD 1: o estado vem de uma assinatura COMPARTILHADA, não de outra própria', () => {
        // ⚠️ A armadilha desta task. Assinar o canal aqui abriria um SEGUNDO
        // WebSocket na mesma aba — o `Sidebar` já mantém um. Seria acrescentar
        // conexão para EXIBIR o estado de uma conexão, e a TASK-096 acabou de
        // mostrar (13 requisições de prefetch → 0) que custo por tela se multiplica
        // pela atividade sem ninguém notar.
        const fonte = semComentarios(TELA);
        expect(fonte, 'a tela abre a própria assinatura do Realtime')
            .not.toMatch(/useSinalDeMudanca|useAtualizacaoDeChaves/);
    });
});

describe('TASK-097 — ação irreversível não divide espaço com preferência', () => {
    it('BDD 2: a zona destrutiva é separada e se anuncia', () => {
        const fonte = semComentarios(TELA);
        expect(fonte, 'não há uma zona destrutiva identificada')
            .toMatch(/zona-perigo|Zona de Perigo|zona de perigo/i);
    });

    it('BDD 2: o destrutivo continua exclusivo de ADMIN', () => {
        // Guarda contra a correção passar do ponto: mover o bloco não pode soltar a
        // checagem de papel que o envolvia. §3.2, e o endpoint é da lista da §3.5.
        const fonte = semComentarios(TELA);
        // `setShowClearModal` SOZINHO acha a declaração do estado, no topo do
        // arquivo e antes de qualquer checagem de papel — foi o que a primeira
        // versão deste cenário mediu, e ela reprovava com o código correto.
        // O que interessa é a CHAMADA no botão.
        const i = fonte.indexOf('setShowClearModal(true)');
        expect(i, 'o botão de limpar sumiu da tela').toBeGreaterThan(0);
        // A checagem tem de estar ANTES do botão, no mesmo bloco condicional.
        const antes = fonte.slice(0, i);
        expect(antes.lastIndexOf("userRole === 'ADMIN'"), 'o bloco destrutivo perdeu a checagem de ADMIN')
            .toBeGreaterThan(0);
    });
});

describe('TASK-097 — o que a tela NÃO pode voltar a ser', () => {
    it('BDD 3: nenhum painel de reconhecimento do sistema', () => {
        // A TASK-079 removeu `/api/server-info` porque versão, host, uptime e
        // contagens são reconhecimento gratuito. "Adicionar elementos do sistema"
        // tem uma resposta óbvia, e ela JÁ FOI REJEITADA uma vez neste projeto.
        const fonte = semComentarios(TELA);
        for (const proibido of [/\buptime\b/i, /\bhostname\b/i, /networkInterfaces/, /\bplatform\b/i, /process\.version/]) {
            expect(fonte, `a tela voltou a expor ${proibido}`).not.toMatch(proibido);
        }
    });

    it('BDD 3: nada é oferecido sem existir', () => {
        // ⚠️ ESTE CENÁRIO JÁ CUMPRIU UM PAPEL E MUDOU DE FORMA, e o registro fica.
        //
        // Na TASK-097 ele PROIBIA a palavra "tutorial" nesta tela: o ADR-018 pedira
        // o botão de "rever tutorial" ali, mas a TASK-098 não existia, e botão que
        // abre coisa nenhuma é a mentira em tela que o ADR-013 combate. Ele reprovou
        // na TASK-098 — que é exatamente como avisou que a hora tinha chegado.
        //
        // Agora afirma o que continua valendo: a tela pode oferecer o tutorial
        // PORQUE ele existe. Se o componente for removido e o botão ficar, reprova
        // de novo.
        const fonte = semComentarios(TELA);
        if (/tutorial/i.test(fonte)) {
            expect(
                fs.existsSync(path.resolve(RAIZ, 'src/app/components/Tutorial.tsx')),
                'a tela oferece um tutorial que não existe mais',
            ).toBe(true);
        }
    });
});
