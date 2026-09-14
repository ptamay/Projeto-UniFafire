import fs from 'fs';
import path from 'path';

// As páginas do App Router, com a ROTA que cada uma serve.
//
// TASK-125 (ADR-027) — extraído das guardas das TASK-090 e 096, que calculavam a rota pelo
// caminho da pasta. Com o grupo `src/app/(app)/`, o caminho passa a ter um segmento que NÃO
// entra no endereço: `(app)/history/page.tsx` serve `/history`. Sem tirar os grupos, as
// guardas procurariam `/(app)/history`, não achariam a página — e passariam em silêncio
// (`.find()` → undefined) ou reprovariam pelo motivo errado.

export const APP = path.resolve(process.cwd(), 'src/app');

export interface Pagina {
    /** O endereço servido, sem grupos de rota: `/`, `/history`, `/account/profile`. */
    rota: string;
    /** O arquivo `page.tsx`. */
    arquivo: string;
    /** A pasta da página — onde mora o `loading.tsx` dela. */
    dir: string;
}

const ehGrupo = (segmento: string) => /^\(.+\)$/.test(segmento);

export function listarPaginas(): Pagina[] {
    const achados: Pagina[] = [];
    const varrer = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory() && e.name !== 'api') varrer(p);
            else if (e.name === 'page.tsx') {
                const segmentos = path.relative(APP, dir).split(path.sep).filter(s => s && !ehGrupo(s));
                achados.push({ rota: '/' + segmentos.join('/'), arquivo: p, dir });
            }
        }
    };
    varrer(APP);
    return achados;
}

/** A página que serve `rota` — lança se não houver, para a guarda não passar em branco. */
export function paginaDe(rota: string): Pagina {
    const p = listarPaginas().find(x => x.rota === rota);
    if (!p) throw new Error(`nenhuma page.tsx serve ${rota}`);
    return p;
}
