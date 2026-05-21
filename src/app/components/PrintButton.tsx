'use client';

export default function PrintButton() {
    return (
        <button
            className="btn btn-green"
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
            🖨️ Imprimir / Gerar PDF
        </button>
    );
}
