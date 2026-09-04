// TASK-076 (Sprint 22 · Etapa 7a do ADR-012) — qualidade do segredo de sessão.
// constitution §2.1: "o segredo de assinatura (jose/HS256) DEVE vir de
// JWT_SECRET no .env (mínimo 32 bytes aleatórios), nunca gerado em runtime".
//
// ## Por que o check antigo não bastava
//
// `session-edge.ts` exigia `jwtSecret.length < 32`. Isso é CONTAGEM DE
// CARACTERES, não entropia: `'a'.repeat(40)` passava. O segredo em uso é um UUID
// com sufixo — comprimento de sobra, aleatoriedade muito menor do que o
// comprimento sugere, e um formato que qualquer atacante reconhece de longe.
//
// ## O que dá e o que não dá para verificar aqui
//
// Não existe teste que prove que uma string foi sorteada. Um segredo aleatório
// de 32 caracteres e um UUID são, olhando caractere a caractere, parecidos —
// qualquer estimativa de entropia de Shannon aceitaria os dois. Fingir o
// contrário seria teatro.
//
// O que dá para fazer, e é o que este módulo faz, é recusar as formas
// CONHECIDAS de segredo fraco — que são as que aparecem em sistema real:
//   1. curto demais;
//   2. pobre em símbolos distintos (repetição, padding, "senha" digitada);
//   3. UUID, com ou sem prefixo/sufixo — o caso concreto deste projeto;
//   4. o placeholder documentado no `.env.example`, que tem comprimento e
//      diversidade suficientes e só cai por ser reconhecido explicitamente.
//
// O item 4 é o mais importante na prática: copiar o exemplo e subir é o caminho
// de menor esforço de quem faz o deploy com pressa. Nenhuma heurística o pegaria.
//
// A recusa é sempre por FORMA reconhecida, nunca por "parece aleatório o
// bastante" — daí não haver limiar de entropia arbitrário aqui.

/** §2.1 — 32 bytes. Em texto, 32 caracteres é o piso equivalente. */
export const MIN_CARACTERES = 32;

/**
 * Símbolos distintos mínimos. 16 num segredo de 32+ caracteres descarta
 * repetição e padding sem recusar segredo legítimo: `openssl rand -base64 48`
 * produz 64 caracteres de um alfabeto de 64, com dezenas de distintos.
 */
export const MIN_DISTINTOS = 16;

/** 8-4-4-4-12 hexadecimal, em qualquer posição da string. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Marcas de valor de exemplo. Comparadas em minúsculas e sem acento não é
 * necessário: o `.env.example` deste repositório está em português e a lista
 * cobre o texto dele mais os termos usuais em inglês.
 */
const PLACEHOLDERS = [
    'sua-chave', 'sua chave', 'troque', 'mude', 'altere', 'exemplo',
    'changeme', 'change-me', 'your-secret', 'your_secret', 'yoursecret',
    'placeholder', 'example', 'secret-here', 'insira', 'coloque',
];

export type ResultadoSegredo = { ok: true } | { ok: false; motivo: string };

export function validarJwtSecret(valor: string | undefined | null): ResultadoSegredo {
    if (!valor) {
        return {
            ok: false,
            motivo: 'JWT_SECRET ausente. Gere um com `openssl rand -base64 48` e ponha no .env — nunca no código.',
        };
    }

    if (valor.length < MIN_CARACTERES) {
        return {
            ok: false,
            motivo: `JWT_SECRET tem ${valor.length} caracteres; o mínimo é ${MIN_CARACTERES} (constitution §2.1).`,
        };
    }

    const distintos = new Set(valor).size;
    if (distintos < MIN_DISTINTOS) {
        return {
            ok: false,
            motivo:
                `JWT_SECRET usa apenas ${distintos} símbolos distintos; o mínimo é ${MIN_DISTINTOS}. ` +
                'Comprimento não é entropia — repetir caractere alonga a string sem tornar o segredo mais difícil de adivinhar.',
        };
    }

    if (UUID.test(valor)) {
        return {
            ok: false,
            motivo:
                'JWT_SECRET tem formato de UUID. Um UUID v4 carrega 122 bits de aleatoriedade num formato reconhecível, ' +
                'e acrescentar sufixo alonga a string sem acrescentar aleatoriedade. Use `openssl rand -base64 48`.',
        };
    }

    const minusculo = valor.toLowerCase();
    const marca = PLACEHOLDERS.find(p => minusculo.includes(p));
    if (marca) {
        return {
            ok: false,
            motivo:
                `JWT_SECRET contém "${marca}" — é o valor de exemplo, não um segredo. ` +
                'Copiar o .env.example e subir deixaria toda sessão assinada com uma chave pública neste repositório.',
        };
    }

    return { ok: true };
}
