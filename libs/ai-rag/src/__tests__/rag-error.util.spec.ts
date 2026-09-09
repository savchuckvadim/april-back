import { describeRagError } from '../application/rag-error.util';

describe('describeRagError', () => {
    it('лимит токенов эмбеддингов: код, статус и читаемый текст', () => {
        // Форма ответа GigaChat из прода 08.09.2026: причина лежит в
        // data.message, а не в message — прямая подстановка давала
        // «[object Object]».
        const error = {
            message: { some: 'object' },
            data: {
                status: 413,
                message: 'Tokens limit exceeded for index 0: 1250 (max 514)',
            },
        };
        const info = describeRagError(error);
        expect(info.code).toBe('tokens-limit');
        expect(info.status).toBe(413);
        expect(info.text).toBe(
            'HTTP 413: Tokens limit exceeded for index 0: 1250 (max 514)',
        );
        expect(info.text).not.toContain('[object Object]');
    });

    it('лимит токенов узнаётся по тексту даже без статуса', () => {
        const info = describeRagError(new Error('Tokens limit exceeded'));
        expect(info.code).toBe('tokens-limit');
        expect(info.status).toBeNull();
    });

    it('отвал ключа и превышение частоты различаются', () => {
        expect(describeRagError({ response: { status: 401 } }).code).toBe(
            'unauthorized',
        );
        expect(describeRagError({ status: 403 }).code).toBe('unauthorized');
        expect(describeRagError({ status: 429 }).code).toBe('rate-limit');
    });

    it('пятисотые — сбой провайдера', () => {
        const info = describeRagError({
            response: { status: 502, statusText: 'Bad Gateway' },
        });
        expect(info.code).toBe('server');
        expect(info.text).toBe('HTTP 502: Bad Gateway');
    });

    it('сетевые сбои узнаются по тексту', () => {
        expect(describeRagError(new Error('socket hang up')).code).toBe(
            'network',
        );
        expect(
            describeRagError(new Error('ECONNRESET while reading')).code,
        ).toBe('network');
        expect(describeRagError(new Error('Request timeout')).code).toBe(
            'network',
        );
    });

    it('непонятная ошибка не притворяется известной', () => {
        const info = describeRagError(new Error('что-то пошло не так'));
        expect(info.code).toBe('unknown');
        expect(info.text).toBe('что-то пошло не так');
    });

    it('пустая и странная ошибка не роняет разбор', () => {
        expect(describeRagError(undefined).code).toBe('unknown');
        expect(describeRagError(null).text).toBe('причина не определена');
        expect(describeRagError({}).text).toBe('причина не определена');
        expect(describeRagError('строка').text).toBe('причина не определена');
    });

    it('длинный текст обрезается', () => {
        const info = describeRagError(new Error('я'.repeat(1000)));
        expect(info.text.length).toBeLessThanOrEqual(300);
    });
});
