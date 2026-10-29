import {
    AiEndpointProbeService,
    probeStatusHint,
} from '../services/ai-endpoint-probe.service';

const makeProbe = (fetchMock: jest.Mock) =>
    new AiEndpointProbeService({ fetch: fetchMock } as never);

describe('AiEndpointProbeService', () => {
    it('2xx — «отвечает»; запрос GET {baseUrl}/models с ключом', async () => {
        const fetchMock = jest
            .fn()
            .mockResolvedValue(new Response('{}', { status: 200 }));
        const result = await makeProbe(fetchMock).models(
            'https://api.openai.com/v1',
            'k',
        );
        expect(result.ok).toBe(true);
        expect(result.message).toBe('отвечает');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.openai.com/v1/models');
        expect(init.method).toBe('GET');
        expect((init.headers as Record<string, string>).Authorization).toBe(
            'Bearer k',
        );
    });

    it('401 — ключ не принят; без ключа заголовка авторизации нет', async () => {
        const fetchMock = jest
            .fn()
            .mockResolvedValue(new Response('', { status: 401 }));
        const result = await makeProbe(fetchMock).models(
            'http://whisper:8000/v1',
            null,
        );
        expect(result).toMatchObject({
            ok: false,
            message: 'HTTP 401 — ключ не принят',
        });
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(init.headers).toEqual({});
    });

    it('сеть упала — «нет связи» с текстом ошибки, исключение не выходит наружу', async () => {
        const fetchMock = jest
            .fn()
            .mockRejectedValue(new Error('ECONNREFUSED'));
        const result = await makeProbe(fetchMock).models(
            'http://whisper:8000/v1',
            null,
        );
        expect(result.ok).toBe(false);
        expect(result.message).toBe('нет связи: ECONNREFUSED');
    });

    it('подсказки по кодам ответа', () => {
        expect(probeStatusHint(403)).toBe(' — ключ не принят');
        expect(probeStatusHint(404)).toContain('/models');
        expect(probeStatusHint(429)).toContain('лимит');
        expect(probeStatusHint(503)).toBe(' — сервис недоступен');
        expect(probeStatusHint(200)).toBe('');
    });
});
