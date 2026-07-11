import {
    getExpiresAtIso,
    InstallChannel,
    isInstallable,
    parseExpiresIn,
    parseInstallParams,
    parseOpenParams,
} from '../lib/parse-install-params.util';

describe('parseInstallParams', () => {
    it('разбирает канал ONAPPINSTALL (токены в JSON-поле auth)', () => {
        const body = {
            event: 'ONAPPINSTALL',
            auth: JSON.stringify({
                access_token: 'at',
                refresh_token: 'rt',
                expires_in: 3600,
                application_token: 'app-token',
                domain: 'portal.bitrix24.ru',
                member_id: 'member-1',
            }),
        };
        const payload = parseInstallParams(body, undefined);

        expect(payload.channel).toBe(InstallChannel.EVENT);
        expect(payload.access_token).toBe('at');
        expect(payload.refresh_token).toBe('rt');
        expect(payload.expires_in).toBe(3600);
        expect(payload.application_token).toBe('app-token');
        expect(payload.domain).toBe('portal.bitrix24.ru');
        expect(payload.member_id).toBe('member-1');
        expect(isInstallable(payload)).toBe(true);
    });

    it('ONAPPINSTALL: берёт DOMAIN/member_id/APP_SID из запроса, если их нет в auth', () => {
        const body = {
            event: 'ONAPPINSTALL',
            auth: JSON.stringify({
                access_token: 'at',
                refresh_token: 'rt',
            }),
            member_id: 'member-2',
        };
        const query = { DOMAIN: 'portal.bitrix24.ru', APP_SID: 'sid' };
        const payload = parseInstallParams(body, query);

        expect(payload.domain).toBe('portal.bitrix24.ru');
        expect(payload.member_id).toBe('member-2');
        expect(payload.application_token).toBe('sid');
    });

    it('разбирает канал iframe PLACEMENT=DEFAULT (AUTH_ID/REFRESH_ID)', () => {
        const body = {
            PLACEMENT: 'DEFAULT',
            AUTH_ID: 'at',
            REFRESH_ID: 'rt',
            AUTH_EXPIRES: '3600',
            member_id: 'member-3',
            APP_SID: 'sid',
        };
        const query = { DOMAIN: 'portal.bitrix24.ru' };
        const payload = parseInstallParams(body, query);

        expect(payload.channel).toBe(InstallChannel.PLACEMENT);
        expect(payload.access_token).toBe('at');
        expect(payload.refresh_token).toBe('rt');
        expect(payload.expires_in).toBe(3600);
        expect(payload.application_token).toBe('sid');
        expect(isInstallable(payload)).toBe(true);
    });

    it('неизвестный канал: UNKNOWN и isInstallable=false', () => {
        const payload = parseInstallParams({ foo: 'bar' }, undefined);
        expect(payload.channel).toBe(InstallChannel.UNKNOWN);
        expect(isInstallable(payload)).toBe(false);
    });

    it('битый JSON в auth не роняет разбор', () => {
        const payload = parseInstallParams(
            { event: 'ONAPPINSTALL', auth: '{broken' },
            { DOMAIN: 'portal.bitrix24.ru' },
        );
        expect(payload.channel).toBe(InstallChannel.EVENT);
        expect(payload.access_token).toBeUndefined();
        expect(isInstallable(payload)).toBe(false);
    });

    it('пустые строки игнорируются (значение не считается заданным)', () => {
        const payload = parseInstallParams(
            { PLACEMENT: 'DEFAULT', AUTH_ID: '', REFRESH_ID: 'rt' },
            { DOMAIN: 'portal.bitrix24.ru' },
        );
        expect(payload.access_token).toBeUndefined();
        expect(isInstallable(payload)).toBe(false);
    });
});

describe('parseOpenParams', () => {
    it('разбирает открытие плейсмента с любым PLACEMENT (не только DEFAULT)', () => {
        const payload = parseOpenParams(
            {
                AUTH_ID: 'at',
                REFRESH_ID: 'rt',
                AUTH_EXPIRES: '3600',
                member_id: 'member-1',
                PLACEMENT: 'CRM_DEAL_DETAIL_TAB',
                PLACEMENT_OPTIONS: '{"ID":"5"}',
            },
            { DOMAIN: 'portal.bitrix24.ru' },
        );

        expect(payload.channel).toBe(InstallChannel.OPEN);
        expect(payload.access_token).toBe('at');
        expect(payload.placement).toBe('CRM_DEAL_DETAIL_TAB');
        expect(payload.placementOptions).toBe('{"ID":"5"}');
        expect(isInstallable(payload)).toBe(true);
    });

    it('открытие без токенов: isInstallable=false', () => {
        const payload = parseOpenParams({}, { DOMAIN: 'portal.bitrix24.ru' });
        expect(isInstallable(payload)).toBe(false);
    });
});

describe('parseExpiresIn', () => {
    it('число и числовая строка → число; мусор → undefined', () => {
        expect(parseExpiresIn(3600)).toBe(3600);
        expect(parseExpiresIn('3600')).toBe(3600);
        expect(parseExpiresIn('abc')).toBeUndefined();
        expect(parseExpiresIn(undefined)).toBeUndefined();
    });
});

describe('getExpiresAtIso', () => {
    it('считает ISO-дату от переданного now; дефолт 3600 секунд', () => {
        const now = Date.UTC(2026, 0, 1, 0, 0, 0);
        expect(getExpiresAtIso(60, now)).toBe('2026-01-01T00:01:00.000Z');
        expect(getExpiresAtIso(undefined, now)).toBe(
            '2026-01-01T01:00:00.000Z',
        );
    });
});
