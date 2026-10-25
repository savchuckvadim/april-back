import { ApiProperty } from '@nestjs/swagger';

/**
 * Ответ чтения настроек приложения для фрейма конструктора: значения
 * ПЛОСКО (ключ реестра → значение) плюс поле-сосед `storedKeys` — какие
 * ключи владелец реально задал на портале. Та же форма, что у
 * event-sales `AppSettingsResolvedDto`, — фронты читают её одним кодом.
 */
export class KonstructorAppSettingsResolvedDto {
    @ApiProperty({
        description:
            'Ключи (camelCase, как в реестре), значения которых РЕАЛЬНО заданы на портале. ' +
            'Остальные ключи ответа — дефолты кода.',
        type: [String],
        example: ['zakupkiEnabled'],
    })
    storedKeys: string[];

    /** Значения настроек: ключ схемы (camelCase) → значение. */
    [key: string]: boolean | number | string | string[];
}
