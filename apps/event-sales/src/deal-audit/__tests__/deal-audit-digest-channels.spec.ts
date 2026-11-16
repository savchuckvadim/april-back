import {
    DEAL_AUDIT_DIGEST_CHANNEL_OPTIONS,
    PORTAL_APP_SETTINGS_SCHEMA,
    EnumPortalAppCode,
} from '@lib/portal-lib/store/app-settings';
import {
    DEAL_AUDIT_DIGEST_CHANNEL,
    DEFAULT_DIGEST_CHANNELS,
    parseDigestChannels,
} from '../lib/deal-audit-digest-channels';

describe('deal-audit: разбор каналов доставки сводки', () => {
    it('по умолчанию — личное сообщение: уведомление в колокольчике теряется', () => {
        expect(DEFAULT_DIGEST_CHANNELS).toEqual({
            notify: false,
            message: true,
            task: false,
        });
    });

    it('пусто или не строка (все галочки сняты) — по умолчанию', () => {
        expect(parseDigestChannels('')).toEqual(DEFAULT_DIGEST_CHANNELS);
        expect(parseDigestChannels(undefined)).toEqual(DEFAULT_DIGEST_CHANNELS);
        expect(parseDigestChannels(null)).toEqual(DEFAULT_DIGEST_CHANNELS);
        expect(parseDigestChannels(42)).toEqual(DEFAULT_DIGEST_CHANNELS);
    });

    it('галочки админки (CSV без пробелов) читаются целиком', () => {
        expect(parseDigestChannels('message,task,notify')).toEqual({
            notify: true,
            message: true,
            task: true,
        });
    });

    it('в админке настройка — галочки ровно по каналам, дефолт реестра совпадает с разбором', () => {
        const descriptor =
            PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                .dealAuditDigestChannels;
        expect(descriptor.isList).toBe(true);
        expect(descriptor.options).toBe(DEAL_AUDIT_DIGEST_CHANNEL_OPTIONS);
        expect(
            DEAL_AUDIT_DIGEST_CHANNEL_OPTIONS.map(option => option.code).sort(),
        ).toEqual(Object.values(DEAL_AUDIT_DIGEST_CHANNEL).sort());
        expect(parseDigestChannels(descriptor.default)).toEqual(
            DEFAULT_DIGEST_CHANNELS,
        );
    });

    it('«task, message» — задача и личное сообщение, уведомления нет', () => {
        expect(parseDigestChannels('task, message')).toEqual({
            notify: false,
            message: true,
            task: true,
        });
    });

    it('регистр и разделители не важны', () => {
        expect(parseDigestChannels(' TASK;Notify ')).toEqual({
            notify: true,
            message: false,
            task: true,
        });
    });

    it('только незнакомые слова — поведение по умолчанию, а не тишина', () => {
        expect(parseDigestChannels('email, sms')).toEqual(
            DEFAULT_DIGEST_CHANNELS,
        );
    });

    it('незнакомое слово рядом со знакомым пропускается', () => {
        expect(parseDigestChannels('task, email')).toEqual({
            notify: false,
            message: false,
            task: true,
        });
    });
});
