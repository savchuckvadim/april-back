import { ApiProperty } from '@nestjs/swagger';

/**
 * Статус конвейера разбора звонков портала (portal_ai_settings старой
 * админки) для settings/get: витрина объясняет, почему разборов мало —
 * «пилот на одном сотруднике» или «конвейер выключен», а не «поломка».
 * Только чтение; меняется в админке разбора звонков.
 */
export class AiCallReportStatusDto {
    @ApiProperty({
        description:
            'Конвейер разбора звонков обрабатывает портал. Нет записи ' +
            'настроек или флаг не задан — false: портал разбирается только ' +
            'после явного включения в админке.',
        type: Boolean,
        example: true,
    })
    enabled: boolean;

    @ApiProperty({
        description:
            'Демо/пилот: Bitrix-id сотрудников, чьи звонки разбираются. ' +
            'null — ограничения нет, разбираются все менеджеры отдела ' +
            'продаж; непустой список — пилот, разборы есть только у этих ' +
            'сотрудников (у остальных пустые строки — это не поломка).',
        type: [String],
        nullable: true,
        example: ['512'],
    })
    pilotUserIds: string[] | null;

    @ApiProperty({
        description:
            'Разбираются только менеджеры отдела продаж. null — на портале ' +
            'не задано, действует дефолт конвейера (только отдел продаж).',
        type: Boolean,
        nullable: true,
        example: true,
    })
    salesOnly: boolean | null;

    @ApiProperty({
        description:
            'Порог длительности звонка для разбора из старой админки, ' +
            'секунд (запасной источник после порогов по типам ' +
            'ai_analytics_definitions / model_params). null — не задан.',
        type: Number,
        nullable: true,
        example: 60,
    })
    minDurationSec: number | null;
}
