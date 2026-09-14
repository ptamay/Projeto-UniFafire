import EsqueletoDePagina from '@/app/components/EsqueletoDePagina';

// TASK-096 (ADR-018) — boundary de carregamento de `/keys`.
//
// Sem este arquivo, o App Router deixa a TELA ANTERIOR PARADA ate o servidor
// responder: esta rota e dinamica (le o cookie de sessao), entao sempre ha espera.
//
// Variante `tabela` porque inventario em tabela — o esqueleto imita a forma da pagina para
// o olho ja se posicionar, e o conteudo nao deslocar nada quando chegar.
export default function Loading() {
    return <EsqueletoDePagina titulo="Controle de Chaves" variante="tabela" />;
}
