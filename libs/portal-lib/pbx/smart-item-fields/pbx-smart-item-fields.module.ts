import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PbxSmartItemFieldsService } from './pbx-smart-item-fields.service';

/**
 * Живые поля элементов смарта (`crm.item.fields`) — общий резолвер
 * «UF-имя ↔ camel-ключ ↔ элементы списка».
 *
 * Отдельный модуль, а не часть pbx-модулей конкретных смартов: полем
 * анкеты может быть поле ЛЮБОГО смарта портала, и следующим заходом этим
 * же резолвером админка будет показывать живую правду (переименованное
 * поле, изменившийся справочник).
 */
@Module({
    imports: [PBXModule],
    providers: [PbxSmartItemFieldsService],
    exports: [PbxSmartItemFieldsService],
})
export class PbxSmartItemFieldsModule {}
