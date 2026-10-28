import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { SupportAssistantModule } from '../support-assistant.module';
import { SupportTelegramBotModule } from '../../telegram-bot/support-telegram-bot.module';

describe('DI-граф ИИ-помощника поддержки', () => {
    it('SupportAssistantModule: стойка, шлюз LLM, Redis и настройки доступны', () => {
        expect(findMissingModuleDependencies(SupportAssistantModule)).toEqual(
            [],
        );
    });

    it('SupportTelegramBotModule: помощник, бот Telegram и память черновиков доступны', () => {
        expect(findMissingModuleDependencies(SupportTelegramBotModule)).toEqual(
            [],
        );
    });

    it('сервисные модули без контроллеров — ручки не утекут в чужой Swagger', () => {
        expect(
            Reflect.getMetadata('controllers', SupportAssistantModule) ?? [],
        ).toEqual([]);
        expect(
            Reflect.getMetadata('controllers', SupportTelegramBotModule) ?? [],
        ).toEqual([]);
    });
});
