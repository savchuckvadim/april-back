import { Module } from '@nestjs/common';
import { MethodologyAdminService } from './methodology-admin.service';
import { MethodologyEditorAdminController } from './methodology-editor.admin.controller';
import { MethodologyAdminController } from './methodology.admin.controller';
import { MethodologyModule } from './methodology.module';

/**
 * Админ-слой методик (`admin/methodologies`): список для бейджей выбора и
 * редактор раздела «Методики» (строки, карточка, проверка, сохранение,
 * каталог брифа) поверх MethodologyModule. Подключать в apps/admin, а не
 * в event-sales (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [MethodologyModule],
    controllers: [MethodologyAdminController, MethodologyEditorAdminController],
    providers: [MethodologyAdminService],
})
export class MethodologyAdminModule {}
