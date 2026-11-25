import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { PortalSessionModule } from '@lib/auth';
import { MethodologyModule } from '@lib/call-lib';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { CallListPointsProvider } from '../ai-analytics/calls/calls-list-points.provider';
import { AiAnalyticsCoreModule } from '../ai-analytics/core/ai-analytics-core.module';
import { PortalViewAuthorReader } from './portal-view.author.reader';
import { PortalViewController } from './portal-view.controller';
import { PortalViewReader } from './portal-view.reader';
import { PortalViewSupportUrlReader } from './portal-view.support-url.reader';
import { PortalViewUseCase } from './portal-view.use-case';
import { PortalViewWriter } from './portal-view.writer';

/**
 * «Настройки отчёта» портала (ручки `kpi-report/portal-view/get|save`, тег
 * «Sales Report», под сессией портала). Поверхность API приложения растёт
 * ровно на эти две ручки (ai/rules/app-api-surface.md); в админку модуль не
 * подключается.
 *
 * Модуль подключён в корне приложения, а не внутри AI-аналитики: настройки
 * управляют и вкладками без AI, их ручки обязаны работать там, где AI-
 * аналитика портала выключена. От AI-аналитики берутся только права
 * (`RequesterAccessService` из ядра) и пункты методики для списка
 * основных бейджей (`CallListPointsProvider` — тот же источник, что у
 * списка разборов; объявлен и здесь, чтобы не править модуль среза).
 *
 * `PortalViewReader` экспортируется: список разборов читает из него
 * основные бейджи. Инстанс Битрикса нигде не хранится — имя сотрудника
 * читается на вызов (`PBXService.init`).
 */
@Module({
    imports: [
        PBXModule,
        PortalSessionModule,
        PortalAppSettingsModule,
        MethodologyModule,
        AiAnalyticsCoreModule,
    ],
    controllers: [PortalViewController],
    providers: [
        PortalViewReader,
        PortalViewWriter,
        PortalViewAuthorReader,
        PortalViewSupportUrlReader,
        CallListPointsProvider,
        PortalViewUseCase,
    ],
    exports: [PortalViewReader],
})
export class PortalViewModule {}
