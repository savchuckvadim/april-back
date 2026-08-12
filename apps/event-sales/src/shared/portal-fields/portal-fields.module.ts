import { Module } from '@nestjs/common';
import { LeadUfDefinitionsService } from './lead-uf-definitions.service';

/**
 * Определения UF-полей портала (живые названия + привязки crm-полей).
 * Общий для карточки заявки и sales-хуков: один кэш на домен.
 */
@Module({
    providers: [LeadUfDefinitionsService],
    exports: [LeadUfDefinitionsService],
})
export class PortalFieldsModule {}
