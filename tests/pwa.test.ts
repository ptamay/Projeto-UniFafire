import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-129 (ADR-030) — o PWA é o manifest, sem service worker.
//
// Este arquivo existia desde a TASK-017 com um cenário só: `manifest.json`
// existe. Ele deu verde por quatro meses com o service worker que o REQ-018
// prometia NUNCA gerado — o `@ducanh2912/next-pwa` só age no callback `webpack`,
// e o build do Next 16 é Turbopack —, e com o único ícone do manifest medindo
// 300×283 enquanto se declarava 192×192 e 512×512. Os cenários abaixo reprovam
// exatamente o que foi achado: ícone que não tem o tamanho que declara, e
// configuração que promete um service worker que o build não produz.

const RAIZ = process.cwd();
const PUBLIC = path.join(RAIZ, 'public');

type Icone = { src: string; sizes?: string; type?: string; purpose?: string };
type Manifest = {
    name?: string;
    short_name?: string;
    start_url?: string;
    display?: string;
    icons?: Icone[];
};

function lerManifest(): Manifest {
    return JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf-8'));
}

/** Arquivo de `public/` a partir do caminho servido na raiz (`/icons/x.png`). */
function arquivoPublico(src: string): string {
    return path.join(PUBLIC, ...src.replace(/^\//, '').split('/'));
}

/**
 * Largura, altura e se há canal alfa, lidos do cabeçalho IHDR do PNG — sem
 * dependência de imagem na suíte. Tipo de cor 4 e 6 têm alfa; um chunk tRNS
 * também dá transparência a RGB e paleta.
 */
function lerPng(arquivo: string): { largura: number; altura: number; temAlfa: boolean } {
    const b = fs.readFileSync(arquivo);
    const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!b.subarray(0, 8).equals(assinatura)) throw new Error(`${arquivo} não é PNG`);
    const tipoDeCor = b[25];
    return {
        largura: b.readUInt32BE(16),
        altura: b.readUInt32BE(20),
        temAlfa: tipoDeCor === 4 || tipoDeCor === 6 || b.includes(Buffer.from('tRNS')),
    };
}

function propositos(icone: Icone): string[] {
    return (icone.purpose ?? 'any').split(/\s+/).filter(Boolean);
}

describe('TASK-129 — o manifest é o que torna o app instalável', () => {
    it('o manifest é JSON válido com os campos que a instalação exige', () => {
        const m = lerManifest();
        expect(m.name, 'sem name').toBeTruthy();
        expect(m.short_name, 'sem short_name — é o nome embaixo do ícone na tela inicial').toBeTruthy();
        expect(m.start_url, 'sem start_url').toBeTruthy();
        expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);
        expect(m.icons?.length, 'sem ícones').toBeGreaterThan(0);
    });

    it('cada ícone existe, é PNG quadrado e tem o tamanho que declara', () => {
        for (const icone of lerManifest().icons ?? []) {
            const arquivo = arquivoPublico(icone.src);
            expect(fs.existsSync(arquivo), `${icone.src} não existe em public/`).toBe(true);

            const { largura, altura } = lerPng(arquivo);
            expect(largura, `${icone.src} mede ${largura}×${altura} — ícone de app é quadrado`).toBe(altura);

            // Um PNG tem UM tamanho. Declarar dois para o mesmo arquivo foi como o
            // 300×283 se passou por 192 e 512.
            const declarados = (icone.sizes ?? '').split(/\s+/).filter(Boolean);
            expect(declarados, `${icone.src} declara ${declarados.join(' ')} para um arquivo só`).toHaveLength(1);
            expect(declarados[0], `${icone.src} declara ${declarados[0]} e mede ${largura}×${altura}`)
                .toBe(`${largura}x${altura}`);
        }
    });

    it('há ícone de 192 e de 512 para uso geral (any)', () => {
        const gerais = (lerManifest().icons ?? []).filter(i => propositos(i).includes('any'));
        const tamanhos = gerais.map(i => i.sizes);
        expect(tamanhos, 'falta o ícone de 192×192 com purpose any').toContain('192x192');
        expect(tamanhos, 'falta o ícone de 512×512 com purpose any').toContain('512x512');
    });

    it('o maskable é um arquivo próprio, não o mesmo ícone com "any maskable"', () => {
        // O maskable é recortado pelo sistema (círculo, gota, quadrado); o
        // desenho precisa caber na zona segura, e o de uso geral não cabe. O
        // mesmo arquivo com os dois propósitos sai cortado num lugar ou miúdo
        // no outro.
        const icones = lerManifest().icons ?? [];
        for (const icone of icones) {
            const p = propositos(icone);
            expect(p.includes('any') && p.includes('maskable'), `${icone.src} declara "any maskable"`).toBe(false);
        }
        expect(icones.some(i => propositos(i).includes('maskable')), 'falta o ícone maskable').toBe(true);
    });

    it('o ícone da tela inicial do iOS é quadrado e opaco', () => {
        // O iOS usa o apple-touch-icon, não o manifest, e pinta de preto o que
        // for transparente.
        const layout = fs.readFileSync(path.join(RAIZ, 'src/app/layout.tsx'), 'utf-8');
        const apple = layout.match(/apple:\s*['"]([^'"]+)['"]/)?.[1];
        expect(apple, 'o layout não declara o ícone do iOS (metadata.icons.apple)').toBeTruthy();

        const arquivo = arquivoPublico(apple!);
        expect(fs.existsSync(arquivo), `${apple} não existe em public/`).toBe(true);
        const { largura, altura, temAlfa } = lerPng(arquivo);
        expect(largura, `${apple} mede ${largura}×${altura}`).toBe(altura);
        expect(temAlfa, `${apple} tem transparência — vira preto na tela inicial do iPhone`).toBe(false);
    });
});

describe('TASK-129 — nada promete um service worker que o build não produz', () => {
    const PACOTES_DE_SW = /next-pwa|serwist|workbox/i;

    it('nenhuma dependência de service worker no package.json', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf-8'));
        const nomes = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        expect(nomes.filter(n => PACOTES_DE_SW.test(n)), 'plugin de SW declarado — ADR-030').toEqual([]);
    });

    it('o next.config não embrulha a configuração num plugin de service worker', () => {
        // Sob Turbopack o plugin do webpack é inerte: fica configurado, não gera
        // nada, e ninguém percebe. Service worker novo entra por CR próprio.
        const config = fs.readFileSync(path.join(RAIZ, 'next.config.ts'), 'utf-8');
        expect(config).not.toMatch(PACOTES_DE_SW);
    });

    it('a lista pública do proxy não libera arquivo de service worker que não existe', () => {
        const proxy = fs.readFileSync(path.join(RAIZ, 'src/proxy.ts'), 'utf-8');
        const lista = proxy.match(/const ARQUIVOS_PUBLICOS\s*=\s*([^;]+);/)?.[1];
        expect(lista, 'ARQUIVOS_PUBLICOS não encontrada no proxy').toBeTruthy();

        const existeSw = fs.existsSync(path.join(PUBLIC, 'sw.js'));
        const existeWorkbox = fs.readdirSync(PUBLIC).some(f => /^workbox-.*\.js$/.test(f));
        if (!existeSw) expect(lista, 'o proxy libera sw.js, que não existe').not.toMatch(/sw\\?\.js/);
        if (!existeWorkbox) expect(lista, 'o proxy libera workbox-*.js, que não existe').not.toMatch(/workbox/);
    });

    it('o código não registra um service worker ausente de public/', () => {
        const registros: string[] = [];
        const varrer = (dir: string) => {
            for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, nome.name);
                if (nome.isDirectory()) varrer(p);
                else if (/\.(tsx?|jsx?|mjs)$/.test(nome.name)) {
                    const fonte = fs.readFileSync(p, 'utf-8');
                    for (const m of fonte.matchAll(/serviceWorker\s*\.\s*register\(\s*['"`]([^'"`]+)['"`]/g)) {
                        registros.push(m[1]);
                    }
                }
            }
        };
        varrer(path.join(RAIZ, 'src'));
        for (const sw of registros) {
            expect(fs.existsSync(arquivoPublico(sw)), `o código registra ${sw}, que não existe em public/`).toBe(true);
        }
    });
});
