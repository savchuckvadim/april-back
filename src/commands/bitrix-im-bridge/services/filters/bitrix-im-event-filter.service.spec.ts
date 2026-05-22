import { BitrixImEventFilterService } from './bitrix-im-event-filter.service';
import { BitrixImBridgeConfigService } from '../config/bitrix-im-bridge-config.service';
import { BitrixImEventDataService } from '../parsers/bitrix-im-event-data.service';
import { ImV2Event } from '../../interfaces/bridge.types';

const makeConfig = (overrides: Partial<BitrixImBridgeConfigService> = {}): BitrixImBridgeConfigService =>
    ({
        isPortalAllowed: () => true,
        isUserAllowed: () => true,
        shouldIgnoreSystemMessages: () => true,
        shouldIgnoreBotMessages: () => true,
        ...overrides,
    }) as unknown as BitrixImBridgeConfigService;

const privateEvent = (authorId = 5): ImV2Event => ({
    type: 'ONIMV2MESSAGEADD',
    data: {
        message: { authorId, text: 'Привет', isSystem: false },
        chat: { type: 'user', dialogId: String(authorId) },
        user: { id: authorId, bot: false },
    },
});

const groupEvent = (authorId = 5): ImV2Event => ({
    type: 'ONIMV2MESSAGEADD',
    data: {
        message: { authorId, text: 'Привет', isSystem: false },
        chat: { type: 'chat', dialogId: 'chat10' },
        user: { id: authorId, bot: false },
    },
});

describe('BitrixImEventFilterService', () => {
    let parser: BitrixImEventDataService;

    beforeEach(() => {
        parser = new BitrixImEventDataService();
    });

    it('пропускает личное сообщение', () => {
        const service = new BitrixImEventFilterService(makeConfig(), parser);
        const result = service.shouldProcess('test.bitrix24.ru', '1', privateEvent(5));
        expect(result.allowed).toBe(true);
    });

    it('блокирует сообщение из группового чата', () => {
        const service = new BitrixImEventFilterService(makeConfig(), parser);
        const result = service.shouldProcess('test.bitrix24.ru', '1', groupEvent(5));
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('not_private_dialog');
    });

    it('блокирует по неразрешённому порталу', () => {
        const service = new BitrixImEventFilterService(
            makeConfig({ isPortalAllowed: () => false }),
            parser,
        );
        const result = service.shouldProcess('blocked.bitrix24.ru', '1', privateEvent());
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('portal_not_in_whitelist');
    });

    it('блокирует неподдерживаемый тип события', () => {
        const service = new BitrixImEventFilterService(makeConfig(), parser);
        const event: ImV2Event = { type: 'ONIMV2JOINCHAT', data: {} };
        const result = service.shouldProcess('test.bitrix24.ru', '1', event);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('unsupported_event_type');
    });

    it('блокирует self-message', () => {
        const service = new BitrixImEventFilterService(makeConfig(), parser);
        const result = service.shouldProcess('test.bitrix24.ru', '5', privateEvent(5));
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('self_message');
    });

    it('блокирует пользователя не из whitelist', () => {
        const service = new BitrixImEventFilterService(
            makeConfig({ isUserAllowed: () => false }),
            parser,
        );
        const result = service.shouldProcess('test.bitrix24.ru', '1', privateEvent(5));
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('user_not_in_whitelist');
    });

    it('блокирует системное сообщение', () => {
        const service = new BitrixImEventFilterService(makeConfig(), parser);
        const event: ImV2Event = {
            type: 'ONIMV2MESSAGEADD',
            data: {
                message: { authorId: 5, text: '', isSystem: true },
                chat: { type: 'user', dialogId: '5' },
                user: { id: 5, bot: false },
            },
        };
        const result = service.shouldProcess('test.bitrix24.ru', '1', event);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('system_message');
    });

    it('блокирует сообщение от бота', () => {
        const service = new BitrixImEventFilterService(makeConfig(), parser);
        const event: ImV2Event = {
            type: 'ONIMV2MESSAGEADD',
            data: {
                message: { authorId: 99, text: 'bot says hi', isSystem: false },
                chat: { type: 'user', dialogId: '99' },
                user: { id: 99, bot: true },
            },
        };
        const result = service.shouldProcess('test.bitrix24.ru', '1', event);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('bot_message');
    });
});
