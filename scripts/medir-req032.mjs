// REQ-032 — mede a defasagem entre a confirmação de uma operação e a atualização
// na tela de OUTRO dispositivo. Critério de aceite: ≤ 500 ms.
//
// ## Por que este arquivo existe
//
// A medição escorregou de sprint em sprint porque fazê-la por inteiro exige uma
// operação REAL em produção — e as sintéticas gravariam para sempre na trilha
// imutável (§7.1). O custo que fazia adiar não era a medição: era ter de montar o
// aparato toda vez. Com ele pronto, a primeira retirada de chave de verdade
// fecha o requisito sem nada a preparar.
//
// ## As três pernas
//
//   A) commit no Postgres  ->  serviço Realtime      só o modo --operacao mede
//   B) serviço Realtime    ->  navegador             mede sempre, sozinho
//   C) sinal no navegador  ->  dado novo em mãos     mede sempre, sozinho
//
// B é medida mandando broadcast para si mesmo no canal de produção: mesmo caminho
// do sinal do trigger, ida e volta no MESMO relógio. C é medida com `GET
// /api/health`, que é pública e consulta o banco — é um PISO do refetch real, que
// usa rotas autenticadas.
//
// ## Os dois modos
//
//   node scripts/medir-req032.mjs
//       Mede B e C. Não escreve nada, não precisa de sessão, roda em segundos.
//
//   node scripts/medir-req032.mjs --operacao
//       Fica ouvindo. Quando alguém fizer uma operação de verdade no sistema, o
//       sinal chega, ele refaz a busca e imprime sinal -> dado em mãos. É o
//       número que falta; deixe rodando durante o expediente.
//
// Precisa de NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no
// ambiente — as mesmas que vão no bundle do navegador, e que NÃO são versionadas.
import { createClient } from '@supabase/supabase-js';

// Duplicados de `src/lib/realtime-sinal.ts` de propósito: importá-lo de cá
// arrastaria o módulo de React inteiro para dentro de um script de linha de
// comando. Se mudarem lá, mudam aqui — e o sintoma é o script não receber sinal
// nenhum enquanto o site atualiza normalmente.
const CANAL_CHAVES = 'chaves';
const EVENTO_MUDOU = 'mudou';

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP = process.env.APP_URL ?? 'https://projeto-uni-fafire.vercel.app';
const N = Number(process.env.AMOSTRAS ?? 25);
const ESPERAR_OPERACAO = process.argv.includes('--operacao');

if (!URL_SUPABASE || !CHAVE) {
    console.error(
        'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
        'São os mesmos valores cadastrados na Vercel (runbook §3.1).',
    );
    process.exit(2);
}

const ts = () => new Date().toISOString().slice(11, 23);
const log = (m) => console.log(`[${ts()}] ${m}`);

function resumo(nome, v) {
    if (!v.length) return null;
    const s = [...v].sort((a, b) => a - b);
    const p = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
    console.log(
        `${nome.padEnd(38)} n=${s.length}  min=${s[0].toFixed(0)}  ` +
        `mediana=${p(0.5).toFixed(0)}  p90=${p(0.9).toFixed(0)}  max=${s[s.length - 1].toFixed(0)}  (ms)`,
    );
    return { min: s[0], mediana: p(0.5), p90: p(0.9) };
}

async function medirRota(caminho) {
    const v = [];
    for (let i = 0; i < N; i++) {
        const t0 = performance.now();
        await (await fetch(`${APP}${caminho}`, { cache: 'no-store' })).text();
        v.push(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 250));
    }
    return v;
}

const supabase = createClient(URL_SUPABASE, CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const pendentes = new Map();
const pernaB = [];
const pontaAPonta = [];

const canal = supabase.channel(CANAL_CHAVES, { config: { broadcast: { self: true } } });

canal
    .on('broadcast', { event: 'ping' }, (msg) => {
        const t0 = pendentes.get(msg.payload?.n);
        if (t0 === undefined) return;
        pernaB.push(performance.now() - t0);
        pendentes.delete(msg.payload.n);
    })
    .on('broadcast', { event: EVENTO_MUDOU }, async () => {
        // O sinal do trigger. Em --operacao, isto é o número que interessa.
        const t0 = performance.now();
        log('SINAL DO BANCO — refazendo a busca');
        try {
            await (await fetch(`${APP}/api/health`, { cache: 'no-store' })).json();
            const dt = performance.now() - t0;
            pontaAPonta.push(dt);
            log(`  sinal -> dado em mãos: ${dt.toFixed(0)} ms`);
        } catch (e) {
            log(`  refetch falhou: ${e.message}`);
        }
    })
    .subscribe(async (estado, err) => {
        log(`canal: ${estado}${err ? ' — ' + err.message : ''}`);
        if (estado !== 'SUBSCRIBED') return;

        log(`perna B (Realtime -> este cliente), ${N} amostras...`);
        for (let n = 0; n < N; n++) {
            pendentes.set(n, performance.now());
            await canal.send({ type: 'broadcast', event: 'ping', payload: { n } });
            await new Promise((r) => setTimeout(r, 300));
        }
        await new Promise((r) => setTimeout(r, 1500));

        // `/login` não toca o banco e `/api/health` faz um `SELECT 1`: a diferença
        // entre as duas é o custo de ir ao banco e voltar. Se ela for grande e
        // CONSTANTE (igual na mediana e no mínimo), é distância, não trabalho —
        // foi assim que se descobriu que a função roda em `iad1` e o banco em
        // `sa-east-1`.
        log(`perna C, ${N} amostras de cada rota...`);
        const semBanco = await medirRota('/login');
        const comBanco = await medirRota('/api/health');

        console.log('\n=== REQ-032 — pernas medidas em produção, sem escrever nada ===\n');
        const b = resumo('B) Realtime -> cliente', pernaB);
        const sb = resumo('   /login      (sem tocar o banco)', semBanco);
        const cb = resumo('C) /api/health (um SELECT 1)', comBanco);
        console.log(
            `\nCusto de UMA ida ao banco: ${(cb.mediana - sb.mediana).toFixed(0)} ms na mediana, ` +
            `${(cb.min - sb.min).toFixed(0)} ms no mínimo.` +
            '\n  Iguais = distância. Diferentes = trabalho.',
        );
        console.log(
            `\nB + uma perna C: ${(b.mediana + cb.mediana).toFixed(0)} ms   ` +
            '| orçamento do REQ-032: 500 ms' +
            '\nO dashboard de PORTEIRO/ADMIN faz DUAS buscas em série — some outra perna C.',
        );

        if (!ESPERAR_OPERACAO) {
            console.log(
                '\nFalta a perna A (commit -> Realtime) e o total de ponta a ponta.' +
                '\nRode com --operacao e deixe ouvindo durante o expediente.',
            );
            await supabase.removeChannel(canal);
            process.exit(0);
        }
        console.log('\n--- ouvindo operações reais. Ctrl+C para sair. ---\n');
    });

process.on('SIGINT', () => {
    console.log('');
    resumo('sinal -> dado em mãos (operações reais)', pontaAPonta);
    process.exit(0);
});

if (!ESPERAR_OPERACAO) setTimeout(() => { log('estourou o tempo'); process.exit(1); }, 180_000);
