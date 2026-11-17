import {
    buildCallPageToken,
    CALL_PAGE_LINK_TYPE,
    callPageMarkOf,
    callPageSecretOf,
    callPageSiteOf,
    callPageUrl,
    isCallPageTokenValid,
    parseCallPageToken,
} from '../call-page-link.util';

const SECRET = 'test-secret';

const tokenOf = (id: string, mark = '', secret = SECRET): string => {
    const token = buildCallPageToken(secret, id, mark);
    if (token === null) throw new Error('ссылка не построена');
    return token;
};

const partsOf = (token: string) => {
    const parts = parseCallPageToken(token);
    if (parts === null) throw new Error('ссылка не разобрана');
    return parts;
};

describe('ссылка-пропуск на страницу разбора звонка', () => {
    it('секрет: общий секрет входа, иначе секрет приложения, иначе нет', () => {
        expect(
            callPageSecretOf({ AUTH_JWT_SECRET: 'a', APP_SECRET_KEY: 'b' }),
        ).toBe('a');
        expect(callPageSecretOf({ APP_SECRET_KEY: 'b' })).toBe('b');
        expect(callPageSecretOf({ AUTH_JWT_SECRET: '  ' })).toBeNull();
        expect(callPageSecretOf({})).toBeNull();
    });

    it('ссылка разбирается обратно в номер расшифровки и сходится по подписи', () => {
        const token = tokenOf('2437933');
        const parts = partsOf(token);
        expect(parts.transcriptionId).toBe('2437933');
        expect(token).toMatch(/^[0-9a-z]+-[A-Za-z0-9_-]{32}$/);
        expect(isCallPageTokenValid(SECRET, parts, '')).toBe(true);
    });

    it('чужая подпись, чужой звонок и другой секрет не проходят', () => {
        const parts = partsOf(tokenOf('100'));
        expect(
            isCallPageTokenValid(
                SECRET,
                { ...parts, transcriptionId: '101' },
                '',
            ),
        ).toBe(false);
        expect(isCallPageTokenValid('other-secret', parts, '')).toBe(false);
        const broken = `${parts.signature.slice(0, -1)}${
            parts.signature.endsWith('A') ? 'B' : 'A'
        }`;
        expect(
            isCallPageTokenValid(SECRET, { ...parts, signature: broken }, ''),
        ).toBe(false);
    });

    it('после отзыва старая ссылка не сходится, новая — сходится', () => {
        const before = partsOf(tokenOf('55'));
        const after = partsOf(tokenOf('55', 'новая-метка'));
        expect(isCallPageTokenValid(SECRET, before, 'новая-метка')).toBe(false);
        expect(isCallPageTokenValid(SECRET, after, 'новая-метка')).toBe(true);
    });

    it('чужой формат ссылки не разбирается', () => {
        expect(parseCallPageToken('')).toBeNull();
        expect(parseCallPageToken('abc')).toBeNull();
        expect(parseCallPageToken('12-короткая')).toBeNull();
        expect(parseCallPageToken(`0-${'A'.repeat(32)}`)).toBeNull();
        expect(parseCallPageToken(`../etc-${'A'.repeat(32)}`)).toBeNull();
    });

    it('номер расшифровки не число — ссылка не строится', () => {
        expect(buildCallPageToken(SECRET, 'abc', '')).toBeNull();
        expect(buildCallPageToken(SECRET, '0', '')).toBeNull();
        expect(buildCallPageToken(SECRET, '', '')).toBeNull();
    });

    it('метка звонка — из самой новой записи отзыва; без отзывов пустая', () => {
        expect(callPageMarkOf([])).toBe('');
        expect(
            callPageMarkOf([
                { id: '5', type: 'agent-analysis', user_result: { mark: 'x' } },
            ]),
        ).toBe('');
        expect(
            callPageMarkOf([
                {
                    id: '7',
                    type: CALL_PAGE_LINK_TYPE,
                    user_result: { mark: 'a' },
                },
                {
                    id: '12',
                    type: CALL_PAGE_LINK_TYPE,
                    user_result: { mark: 'b' },
                },
                { id: '9', type: CALL_PAGE_LINK_TYPE, user_result: null },
            ]),
        ).toBe('b');
    });

    it('адрес сайта: схема, домен и путь без хвостового «/»; пустой или битый — нет', () => {
        expect(callPageSiteOf('https://next.april-app.ru/')).toBe(
            'https://next.april-app.ru',
        );
        // «Отчёт» под префиксом: путь сохраняется, параметры и якорь — нет.
        expect(callPageSiteOf(' https://site.ru/kpi-sales/?x=1#top ')).toBe(
            'https://site.ru/kpi-sales',
        );
        expect(callPageSiteOf('http://localhost:5000/')).toBe(
            'http://localhost:5000',
        );
        expect(callPageSiteOf('')).toBeNull();
        expect(callPageSiteOf(null)).toBeNull();
        expect(callPageSiteOf('не адрес')).toBeNull();
        expect(callPageSiteOf('javascript:alert(1)')).toBeNull();
    });

    it('адрес страницы: сайт без хвостового «/» и путь /call/', () => {
        expect(callPageUrl('https://next.april-app.ru/', 'abc')).toBe(
            'https://next.april-app.ru/call/abc',
        );
        expect(callPageUrl('https://site.ru/kpi-sales', 'abc')).toBe(
            'https://site.ru/kpi-sales/call/abc',
        );
        expect(callPageUrl(' https://site.ru ', 'abc')).toBe(
            'https://site.ru/call/abc',
        );
    });
});
