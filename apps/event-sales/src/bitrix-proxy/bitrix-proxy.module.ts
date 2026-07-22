import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PBXModule } from '@lib/pbx';
import { AgentKeyGuard } from '../agent-gate/guards/agent-key.guard';
import { BitrixProxyController } from './bitrix-proxy.controller';
import { BitrixProxyService } from './bitrix-proxy.service';

/**
 * Модуль прокси REST API Bitrix для внешних агентов.
 *
 * Открывает эндпоинт Agent API, через который агент может вызвать любой
 * метод Bitrix на портале по домену. Доступ защищён теми же ключами, что
 * и остальной Agent API (AgentKeyGuard, env AGENT_API_KEYS), с доменной
 * изоляцией ключа. Вся работа с авторизацией портала (вебхук / OAuth
 * маркетплейса) делегирована PBXModule.
 */
@Module({
    imports: [ConfigModule, PBXModule],
    controllers: [BitrixProxyController],
    providers: [AgentKeyGuard, BitrixProxyService],
    exports: [BitrixProxyService],
})
export class BitrixProxyModule {}
