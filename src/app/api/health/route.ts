import { NextResponse } from 'next/server';
import { query } from '@/lib/pg';
import { migracoesPendentes } from '@/lib/migracoes-esperadas';

// TASK-079 (Sprint 23 · Etapa 7b do ADR-012) — endpoint de saúde.
//
// ## Para que ele existe
//
// Duas coisas, e as duas importam:
//
// 1. O projeto Supabase gratuito PAUSA após ~7 dias sem requisição (ADR-012).
//    Pausado, o sistema não responde e ninguém é avisado — só descobre quem
//    tentar usar. O ping agendado (`.github/workflows/keepalive.yml`) bate aqui.
// 2. É o único jeito de perguntar "o sistema está de pé?" sem credencial.
//
// ## Por que consulta o banco
//
// Responder 200 só porque o processo subiu seria confortável e inútil: em
// execução serverless a instância sempre sobe. O que pode faltar é o banco — e é
// o banco que pausa. Um health verde com o banco morto é PIOR que health nenhum:
// o ping fica verde enquanto o sistema não serve para nada, e a única coisa que
// ele estaria mantendo viva é a própria mentira.
//
// ## Por que a resposta é tão pobre
//
// Ela responde SEM SESSÃO, na internet pública. Versão, uptime, hostname,
// caminho, contagem de registros — cada campo é reconhecimento gratuito para
// quem procura o que atacar. A rota `/api/server-info`, removida nesta mesma
// task, era exatamente esse conjunto com uma sessão na frente: IPs da rede
// interna, hostname da máquina, plataforma, arquitetura e uptime.
//
// A lista de campos é fechada e tem teste. Campo novo reprova por omissão.
//
// ## Banco de pé não basta: o schema tem de ser o que o código espera
//
// TASK-103 (ADR-021). Em 2026-09-08 o código da TASK-093 foi publicado antes das
// colunas: `SELECT 1` passava, este endpoint respondia 200, e resetar acesso e
// criar usuário davam 500. Agora ele confere o registro de migrations e responde
// 503 `schema_pendente` — o `keepalive.yml` e o `pos-deploy.yml` falham, e o
// GitHub avisa quem publicou. QUAIS faltam vai só para o log do servidor: o nome
// de um controle que ainda não está no banco é informação para quem ataca.

export async function GET() {
    try {
        await query('SELECT 1');
        const pendentes = await migracoesPendentes();
        if (pendentes.length) {
            console.error('[Health] Schema pendente — o código espera migrations que o banco não registra:',
                pendentes.join(', '), '— aplicar com o runner (runbook §4).');
            return NextResponse.json({ status: 'degraded', database: 'schema_pendente' }, { status: 503 });
        }
        return NextResponse.json({ status: 'ok', database: 'ok' });
    } catch (e) {
        // O erro do driver ecoa a string de conexão INTEIRA, com senha. Ele fica
        // no log do servidor; para fora vai só o fato.
        console.error('[Health] Banco não respondeu:', e);
        return NextResponse.json({ status: 'degraded', database: 'down' }, { status: 503 });
    }
}
