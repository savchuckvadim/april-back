import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { SalesFinanceModule } from '../sales-finance';
import { PbxFieldsController } from './pbx-fields.controller';

/**
 * PBX-поля сущностей Bitrix (deal/company): метаданные + запись значений.
 *
 * SalesFinanceModule импортирован ради SalesFinanceCacheService: изменение
 * полей сделки/компании инвалидирует финансовые отчёты домена. Доменные
 * сервисы и use-case создаются per-request через `new` (CLAUDE.md про
 * race condition с bitrix-состоянием) — providers пусты.
 */
@Module({
    imports: [PBXModule, SalesFinanceModule],
    controllers: [PbxFieldsController],
})
export class PbxFieldsModule {}
