import { Module } from '@nestjs/common';
import { FieldModule } from '@lib/portal-lib/konstructor';
import { PbxFieldController } from './controllers/pbx-field.controller';
import { PbxFieldUseCase } from './use-cases/pbx-field.use-case';

/**
 * CRUD-эндпоинты полей конструктора (`fields`) в pbx-install.
 * Доменная логика — в lib `FieldModule` (`@lib/portal-lib/konstructor`).
 */
@Module({
    imports: [FieldModule],
    controllers: [PbxFieldController],
    providers: [PbxFieldUseCase],
})
export class PbxFieldModule {}
