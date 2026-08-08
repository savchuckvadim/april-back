import { Module } from '@nestjs/common';
import { TemplateBasePrismaRepository } from './template-base.prisma.repository';
import { TemplateBaseRepository } from './template-base.repository';
import { TemplateBaseService } from './template-base.service';

/**
 * Сервисный модуль шаблонов-баз. Контроллер вынесен в
 * {@link TemplateBaseAdminModule} — см. ai/rules/app-api-surface.md.
 */
@Module({
    providers: [
        {
            provide: TemplateBaseRepository,
            useClass: TemplateBasePrismaRepository,
        },
        TemplateBaseService,
    ],
    exports: [TemplateBaseRepository],
})
export class TemplateBaseModule {}
