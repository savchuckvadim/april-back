import { Injectable } from '@nestjs/common';
import { Field } from '../../shared/parse-field-excel/type/parse-field.type';
import { USER_FIELDS } from '../constants/user-fields.const';

/**
 * Отдаёт поля пользователя из констант (аналог парсера Excel, но источник — код).
 */
@Injectable()
export class PbxUserParseService {
    /** Все поля пользователя из констант. */
    getFields(): Field[] {
        return USER_FIELDS;
    }

    /** Поля, помеченные к установке/обновлению (isNeedUpdate). */
    getFieldsForInstall(): Field[] {
        return USER_FIELDS.filter(field => field.isNeedUpdate);
    }

    /** Находит поле по code (для manage-операций). */
    findByCode(code: string): Field | undefined {
        return USER_FIELDS.find(field => field.code === code);
    }
}
