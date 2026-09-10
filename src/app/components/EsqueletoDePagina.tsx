// TASK-096 (ADR-018) — o que aparece enquanto o servidor responde.
//
// ## Por que existe
//
// Todas as páginas são dinâmicas (`ƒ` no build, porque leem o cookie de sessão).
// Sem um `loading.tsx`, o App Router deixa a **tela anterior parada** até o servidor
// terminar de renderizar: nada indica que algo está acontecendo, a impressão é de
// travamento, e o usuário clica de novo — o que piora tudo.
//
// ## Por que ele imita a página, em vez de ser um spinner
//
// Spinner central diz "espere" e apaga a tela. O esqueleto diz "espere, e vai ser
// mais ou menos assim" — o olho já se posiciona onde o conteúdo vai cair, e a
// transição não desloca nada quando ele chega.
//
// A classe `.skeleton` já existia em `globals.css`, com shimmer e respeito a
// `prefers-reduced-motion`. Reaproveitada, não reinventada.

type Variante = 'tabela' | 'cards' | 'formulario';

function Linha({ largura, altura = 14 }: { largura: string; altura?: number }) {
    return <div className="skeleton" style={{ width: largura, height: altura }} />;
}

function Tabela() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
                <Linha largura="22%" /><Linha largura="18%" /><Linha largura="15%" /><Linha largura="20%" />
            </div>
            {/* Seis linhas: o suficiente para o olho entender que vem uma lista, e
                pouco o bastante para não parecer conteúdo de verdade. */}
            {Array.from({ length: 6 }, (_, i) => (
                <div key={i} style={{ display: 'flex', gap: '1rem', opacity: 1 - i * 0.12 }}>
                    <Linha largura="22%" altura={12} /><Linha largura="18%" altura={12} />
                    <Linha largura="15%" altura={12} /><Linha largura="20%" altura={12} />
                </div>
            ))}
        </div>
    );
}

function Cards() {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', opacity: 1 - i * 0.1 }}>
                    <Linha largura="60%" altura={16} />
                    <Linha largura="40%" altura={12} />
                    <Linha largura="80%" altura={12} />
                </div>
            ))}
        </div>
    );
}

function Formulario() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 460 }}>
            {Array.from({ length: 4 }, (_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <Linha largura="35%" altura={11} />
                    <Linha largura="100%" altura={38} />
                </div>
            ))}
        </div>
    );
}

/**
 * `aria-busy` e o texto para leitor de tela não são enfeite: sem eles, quem navega
 * por leitura de tela ouve a página anterior e não recebe nenhum aviso de que algo
 * está a caminho — que é exatamente o defeito visual, transposto.
 */
export default function EsqueletoDePagina({ titulo, variante }: { titulo: string; variante: Variante }) {
    return (
        <main className="main-content" aria-busy="true">
            <span className="sr-only" role="status">Carregando {titulo}…</span>
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 className="page-title" aria-hidden="true">{titulo}</h1>
                <Linha largura="240px" altura={12} />
            </div>
            <div className="card">
                {variante === 'tabela' && <Tabela />}
                {variante === 'cards' && <Cards />}
                {variante === 'formulario' && <Formulario />}
            </div>
        </main>
    );
}
