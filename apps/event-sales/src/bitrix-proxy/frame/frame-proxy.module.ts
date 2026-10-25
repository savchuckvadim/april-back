import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';
import { PBXModule } from '@lib/pbx';
import { FrameProxyController } from './frame-proxy.controller';
import { FrameProxyService } from './frame-proxy.service';

/**
 * Работа «Звонков» через сервер при нехватке прав сотрудника на портале.
 * Ручки — приложения event-sales (их зовёт фрейм), под portal-context
 * сессией; авторизация портала (вебхук / OAuth) — в PBXModule.
 */
@Module({
    imports: [PBXModule, PortalSessionModule],
    controllers: [FrameProxyController],
    providers: [FrameProxyService],
})
export class FrameProxyModule {}
