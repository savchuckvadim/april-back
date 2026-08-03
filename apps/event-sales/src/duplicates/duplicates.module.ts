import { Module } from '@nestjs/common';
import { PbxDuplicateModule } from '@lib/portal-lib/pbx-duplicate';
import { DuplicatesController } from './controllers/duplicates.controller';
import { DuplicatesUseCase } from './use-cases/duplicates.use-case';

/**
 * Поиск дублей для фрейма отдела продаж.
 *
 * Доменная логика — в общей либе `@lib/portal-lib/pbx-duplicate`; здесь
 * только HTTP-слой. Админка позже выставит те же сервисы своими
 * эндпоинтами, не дублируя код.
 */
@Module({
    imports: [PbxDuplicateModule],
    controllers: [DuplicatesController],
    providers: [DuplicatesUseCase],
})
export class DuplicatesModule {}
