import { Module } from '@nestjs/common';
import { BxDepartmentModule } from '@lib/bx-department';
import { HeadAccessService } from './head-access.service';

/**
 * Проверка «руководитель ли» для кнопок присоединения и объединения.
 * `BxDepartmentModule` не глобальный — импорт обязателен (снимок структуры
 * и суперпользователи вендора).
 */
@Module({
    imports: [BxDepartmentModule],
    providers: [HeadAccessService],
    exports: [HeadAccessService],
})
export class HeadAccessModule {}
