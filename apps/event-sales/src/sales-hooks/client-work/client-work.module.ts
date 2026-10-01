import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { ActiveStaffModule } from '../../shared/active-staff/active-staff.module';
import { HeadAccessModule } from '../../shared/head-access/head-access.module';
import { UserNameResolver } from '../../shared/lead-request/user-name.resolver';
import { SalesHookCoreModule } from '../core/sales-hook-core.module';
import { ClientWorkController } from './controllers/client-work.controller';
import { ClientWorkService } from './services/client-work.service';

/**
 * «Работа клиента»: открытые сделки клиента и присоединение пачкой через
 * хук join-to-main (сам хук регистрирует JoinToMainHookModule — здесь
 * только постановка операции). `HeadAccessModule` — проверка прав,
 * `ActiveStaffModule` — кто из ответственных работает; `UserNameResolver`
 * объявлен своим провайдером, как в соседних модулях (его зависимости
 * PBXService и AppCacheService доступны).
 */
@Module({
    imports: [
        SalesHookCoreModule,
        PBXModule,
        ActiveStaffModule,
        HeadAccessModule,
    ],
    controllers: [ClientWorkController],
    providers: [ClientWorkService, UserNameResolver],
})
export class ClientWorkModule {}
