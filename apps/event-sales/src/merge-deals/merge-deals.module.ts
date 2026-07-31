import { Module } from '@nestjs/common';
import { MergeDealsController } from './controllers/merge-deals.controller';
import { MergeDealsService } from './services/merge-deals.service';

/**
 * Модуль объединения сделок портала Bitrix.
 *
 * Пока подключён как заглушка: контроллер и DTO готовы, эндпоинты видны
 * в Swagger и валидируют вход, но доменная логика слияния не реализована,
 * поэтому модуль не тянет за собой PBXModule и не ходит в Битрикс.
 */
@Module({
    controllers: [MergeDealsController],
    providers: [MergeDealsService],
    exports: [MergeDealsService],
})
export class MergeDealsModule {}
