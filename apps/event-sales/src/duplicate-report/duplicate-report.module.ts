import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { BxDepartmentModule } from '@lib/bx-department';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { ActiveStaffModule } from '../shared/active-staff/active-staff.module';
import { UserNameResolver } from '../shared/lead-request/user-name.resolver';
import { PortalWorkingHoursService } from '../shared/working-hours/portal-working-hours.service';
import { DuplicateReportController } from './controllers/duplicate-report.controller';
import { DuplicateReportScheduler } from './duplicate-report.scheduler';
import { DuplicateReportRunState } from './services/duplicate-report-run-state';
import { DuplicateReportSettingsService } from './services/duplicate-report-settings.service';
import { DuplicateReportTaskStore } from './services/duplicate-report-task.store';
import { DuplicateReportService } from './services/duplicate-report.service';

/**
 * Еженедельный отчёт по дублям сделок: клиенты с несколькими открытыми
 * сделками воронки ОП — руководителям задачей с Excel.
 *
 * `RedisModule` и `PortalAppSettingsModule` ОБЯЗАТЕЛЬНЫ: планировщик
 * держит Redis-лок и метку недели и читает ростер порталов (оба модуля не
 * глобальные — без импорта приложение не поднимется). `BxDepartmentModule`
 * — снимок структуры для «Отчёта РОПу» и «по своему отделу».
 * `ActiveStaffModule` — кто из ответственных и получателей работает.
 * `PortalWorkingHoursService` и `UserNameResolver` объявлены своими
 * провайдерами, как в соседних модулях: их модулей нет, а зависимости
 * (PBXService, AppCacheService — @Global) доступны.
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        PortalAppSettingsModule,
        BxDepartmentModule,
        ActiveStaffModule,
    ],
    controllers: [DuplicateReportController],
    providers: [
        DuplicateReportService,
        DuplicateReportSettingsService,
        DuplicateReportTaskStore,
        DuplicateReportRunState,
        DuplicateReportScheduler,
        PortalWorkingHoursService,
        UserNameResolver,
    ],
})
export class DuplicateReportModule {}
