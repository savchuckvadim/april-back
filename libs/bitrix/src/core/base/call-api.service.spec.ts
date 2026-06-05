import { CallApiService } from './call-api.service';
import { BitrixCore } from './bitrix-core.service';
import { EBxMethod, EBxNamespace } from '../domain/consts/bitrix-api.enum';
import { EBXEntity } from '../domain/consts/bitrix-entities.enum';

/**
 * Проверяем формирование строки REST-метода в callType,
 * особенно крайние случаи доменов ботов:
 * - entity-less методы (imbot.register)
 * - PascalCase v2 (imbot.v2.Bot.register)
 * - точечные методы (imbot.chat.user.add)
 * - imopenlines (imopenlines.bot.session.finish)
 */
describe('CallApiService.callType — построение метода', () => {
    let requestMock: jest.Mock;
    let service: CallApiService;

    beforeEach(() => {
        requestMock = jest.fn().mockResolvedValue({ data: { result: true } });
        const core = { request: requestMock } as unknown as BitrixCore;
        service = new CallApiService(core, {} as never);
    });

    const lastMethod = (): string => requestMock.mock.calls[0][0] as string;

    it('обычный метод: crm.deal.get', async () => {
        await service.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.GET,
            {} as never,
        );
        expect(lastMethod()).toBe('crm.deal.get');
    });

    it('без namespace: user.get', async () => {
        await service.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER,
            EBxMethod.GET,
            {} as never,
        );
        expect(lastMethod()).toBe('user.get');
    });

    it('entity-less: imbot.register', async () => {
        await service.callType(
            EBxNamespace.IMBOT,
            EBXEntity.BOT_LIFECYCLE,
            EBxMethod.REGISTER,
            {} as never,
        );
        expect(lastMethod()).toBe('imbot.register');
    });

    it('imbot.bot.list (entity bot)', async () => {
        await service.callType(
            EBxNamespace.IMBOT,
            EBXEntity.BOT,
            EBxMethod.LIST,
            {} as never,
        );
        expect(lastMethod()).toBe('imbot.bot.list');
    });

    it('точечный метод: imbot.chat.user.add', async () => {
        await service.callType(
            EBxNamespace.IMBOT,
            EBXEntity.CHAT,
            EBxMethod.USER_ADD,
            {} as never,
        );
        expect(lastMethod()).toBe('imbot.chat.user.add');
    });

    it('v2 PascalCase: imbot.v2.Bot.register', async () => {
        await service.callType(
            EBxNamespace.IMBOT_V2,
            EBXEntity.BOT_V2,
            EBxMethod.REGISTER,
            {} as never,
        );
        expect(lastMethod()).toBe('imbot.v2.Bot.register');
    });

    it('v2 сообщение: imbot.v2.Chat.Message.send', async () => {
        await service.callType(
            EBxNamespace.IMBOT_V2,
            EBXEntity.CHAT_MESSAGE_V2,
            EBxMethod.SEND,
            {} as never,
        );
        expect(lastMethod()).toBe('imbot.v2.Chat.Message.send');
    });

    it('v2 реакция: imbot.v2.Chat.Message.Reaction.add', async () => {
        await service.callType(
            EBxNamespace.IMBOT_V2,
            EBXEntity.CHAT_MESSAGE_V2,
            EBxMethod.REACTION_ADD,
            {} as never,
        );
        expect(lastMethod()).toBe('imbot.v2.Chat.Message.Reaction.add');
    });

    it('imopenlines: imopenlines.bot.session.finish', async () => {
        await service.callType(
            EBxNamespace.IMOPENLINES,
            EBXEntity.BOT_SESSION,
            EBxMethod.SESSION_FINISH,
            {} as never,
        );
        expect(lastMethod()).toBe('imopenlines.bot.session.finish');
    });
});
