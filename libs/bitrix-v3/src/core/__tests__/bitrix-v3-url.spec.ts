import { buildBitrixV3Url } from '../base/bitrix-v3-url';

describe('buildBitrixV3Url', () => {
    const domain = 'example.bitrix24.ru';
    const method = 'humanresources.node.list';

    it('строит URL вебхука формата rest/447/token', () => {
        expect(
            buildBitrixV3Url({ domain, webhook: 'rest/447/abc123' }, method),
        ).toBe(
            'https://example.bitrix24.ru/rest/api/447/abc123/humanresources.node.list',
        );
    });

    it('нормализует слэши и регистр rest/', () => {
        expect(
            buildBitrixV3Url({ domain, webhook: '/REST/447/abc123/' }, method),
        ).toBe(
            'https://example.bitrix24.ru/rest/api/447/abc123/humanresources.node.list',
        );
    });

    it('принимает полный URL вебхука', () => {
        expect(
            buildBitrixV3Url(
                {
                    domain,
                    webhook: 'https://example.bitrix24.ru/rest/447/abc123/',
                },
                method,
            ),
        ).toBe(
            'https://example.bitrix24.ru/rest/api/447/abc123/humanresources.node.list',
        );
    });

    it('строит OAuth-URL без вебхука', () => {
        expect(
            buildBitrixV3Url({ domain, accessToken: 'token123' }, method),
        ).toBe('https://example.bitrix24.ru/rest/api/humanresources.node.list');
    });

    it('бросает ошибку без domain', () => {
        expect(() =>
            buildBitrixV3Url({ domain: '', webhook: 'rest/1/a' }, method),
        ).toThrow('domain');
    });

    it('бросает ошибку без webhook и accessToken', () => {
        expect(() => buildBitrixV3Url({ domain }, method)).toThrow(
            'webhook или accessToken',
        );
    });

    it('бросает ошибку на пустом webhook', () => {
        expect(() =>
            buildBitrixV3Url({ domain, webhook: 'rest//' }, method),
        ).toThrow('пустой webhook');
    });
});
