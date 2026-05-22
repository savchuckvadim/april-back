import { ApiPropertyOptional } from '@nestjs/swagger';

/** Привязка к порталу (1:1 на шаблоне). null — отвязать. */
export class SetInvoiceTemplatePortalDto {
    @ApiPropertyOptional({
        description: 'ID портала; null — отвязать (часто перевести в public)',
        nullable: true,
    })
    portal_id?: string | null;
}

/** Привязка к агенту (поставщику). null — отвязать. */
export class SetInvoiceTemplateAgentDto {
    @ApiPropertyOptional({
        description: 'ID агента (agents.id); null — отвязать',
        nullable: true,
    })
    agent_id?: string | null;
}
