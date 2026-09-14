import EsqueletoDePagina from '@/app/components/EsqueletoDePagina';

// TASK-096 (ADR-018) — boundary de carregamento de `/`.
//
// Sem este arquivo, o App Router deixa a TELA ANTERIOR PARADA ate o servidor
// responder: esta rota e dinamica (le o cookie de sessao), entao sempre ha espera.
//
// Variante `cards` porque o dashboard e uma grade de cartoes de chave — o esqueleto imita a forma da pagina para
// o olho ja se posicionar, e o conteudo nao deslocar nada quando chegar.
export default function Loading() {
    return <EsqueletoDePagina titulo="Monitoramento de Chaves" variante="cards" />;
}
