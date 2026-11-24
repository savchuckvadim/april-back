import { Module } from '@nestjs/common';
import { ContractModule } from './contract.module';
import { ContractController } from './contract.controller';

/**
 * Админ-слой договоров гаранта: `/contracts` (создание, правка, список и
 * договоры портала). Контроллеру нужен только ContractService из
 * {@link ContractModule}. Подключать ТОЛЬКО в приложении админки, под её
 * авторизацией; konstructor этот модуль не импортирует
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [ContractModule],
    controllers: [ContractController],
})
export class ContractAdminModule {}
