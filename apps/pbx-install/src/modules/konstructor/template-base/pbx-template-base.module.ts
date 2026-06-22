import { Module } from '@nestjs/common';
import { TemplateBaseModule } from '@lib/portal-lib/konstructor';
import { PbxTemplateBaseController } from './controllers/pbx-template-base.controller';
import { PbxTemplateBaseUseCase } from './use-cases/pbx-template-base.use-case';

/**
 * CRUD-эндпоинты шаблонов конструктора и связей «шаблон ↔ поле» в pbx-install.
 * Доменная логика — в lib `TemplateBaseModule` (`@lib/portal-lib/konstructor`).
 */
@Module({
    imports: [TemplateBaseModule],
    controllers: [PbxTemplateBaseController],
    providers: [PbxTemplateBaseUseCase],
})
export class PbxTemplateBaseModule {}
