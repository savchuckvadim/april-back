import { Module } from '@nestjs/common';
import { BxCrmEntityService } from './services/bx-crm-entity.service';

/**
 * crm.entity.* (mergeBatch).
 *
 * Отступление от BITRIX_DOMAIN_MODULE_GUIDE: batch-сервис не создаётся —
 * mergeBatch разрушающий и медленный, в HTTP-batch ему не место
 * (см. bx-crm-entity.repository.ts).
 */
@Module({
    providers: [BxCrmEntityService],
    exports: [BxCrmEntityService],
})
export class BitrixCrmEntityDomainModule {}
