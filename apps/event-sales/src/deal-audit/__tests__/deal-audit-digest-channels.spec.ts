import {
    DEFAULT_DIGEST_CHANNELS,
    parseDigestChannels,
} from '../lib/deal-audit-digest-channels';

describe('deal-audit: разбор каналов доставки сводки', () => {
    it('пусто или не строка — как было: только уведомление портала', () => {
        expect(parseDigestChannels('')).toEqual(DEFAULT_DIGEST_CHANNELS);
        expect(parseDigestChannels(undefined)).toEqual(DEFAULT_DIGEST_CHANNELS);
        expect(parseDigestChannels(null)).toEqual(DEFAULT_DIGEST_CHANNELS);
        expect(parseDigestChannels(42)).toEqual(DEFAULT_DIGEST_CHANNELS);
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
