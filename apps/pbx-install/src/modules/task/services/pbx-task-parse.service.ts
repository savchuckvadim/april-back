import { Injectable } from '@nestjs/common';
import { Field } from '../../shared/parse-field-excel/type/parse-field.type';
import { TASK_FIELDS } from '../constants/task-fields.const';

/**
 * Отдаёт поля задачи из констант (аналог парсера Excel, но источник — код).
 */
@Injectable()
export class PbxTaskParseService {
    /** Все поля задачи из констант. */
    getFields(): Field[] {
        return TASK_FIELDS;
    }

    /** Поля, помеченные к установке/обновлению (isNeedUpdate). */
    getFieldsForInstall(): Field[] {
        return TASK_FIELDS.filter(field => field.isNeedUpdate);
    }

    /** Находит поле по code (для manage-операций). */
    findByCode(code: string): Field | undefined {
        return TASK_FIELDS.find(field => field.code === code);
    }
}
