// TASK-131 (emenda do ADR-029) — linhas do Postgres no formato que o JSON da API entrega.
//
// O `pg` devolve `timestamptz` como `Date`. Pela rota, `NextResponse.json` o transforma em texto
// ISO; entregue direto a um componente de cliente pela página, ele chegaria como `Date`. O mesmo
// componente receberia dois formatos conforme o caminho, e o defeito apareceria só num deles.
// Convertendo aqui, os dois caminhos entregam exatamente o que a rota sempre entregou.

type ComDatasEmTexto<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };

export function comDatasEmIso<T extends object>(linhas: T[]): ComDatasEmTexto<T>[] {
    return linhas.map(linha => {
        const saida: Record<string, unknown> = {};
        for (const [chave, valor] of Object.entries(linha)) {
            saida[chave] = valor instanceof Date ? valor.toISOString() : valor;
        }
        return saida as ComDatasEmTexto<T>;
    });
}
