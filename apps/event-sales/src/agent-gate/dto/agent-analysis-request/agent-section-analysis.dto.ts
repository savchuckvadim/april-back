import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import {
    CALL_REPORT_SECTION_CODES,
    CallReportSectionCode,
} from '@lib/call-lib';

/**
 * Разделы рубрики разбора — вынесены из общего файла контракта агента
 * (лимит файла); имена и декораторы прежние, реэкспорт через барель.
 */

/** Разбор одного формализованного раздела разговора. */
export class AgentSectionAnalysisDto {
    @ApiProperty({
        description:
            'Код раздела: GREETING (приветствие), NEEDS (выявление потребностей), ' +
            'PRESENTATION (презентация под потребности), OBJECTIONS (работа с ' +
            'возражениями), PRICE (работа по цене), CLOSING (закрытие разговора), ' +
            'REFUSAL (поведение при отказах).',
        enum: CALL_REPORT_SECTION_CODES,
        example: 'OBJECTIONS',
    })
    @IsString()
    @IsIn(CALL_REPORT_SECTION_CODES as unknown as string[])
    section: CallReportSectionCode;

    @ApiProperty({
        description:
            'Коэффициент актуальности раздела для ЭТОГО типа звонка, 0–100. ' +
            '0 — раздел не применим (например «Работа по цене» в холодном звонке): ' +
            'оценка не ставится и раздел не влияет на итог.',
        example: 100,
        type: Number,
        minimum: 0,
        maximum: 100,
    })
    @IsInt()
    @Min(0)
    @Max(100)
    relevance: number;

    @ApiPropertyOptional({
        description:
            'Оценка работы менеджера в разделе, 1–10. Обязательна при relevance > 0.',
        example: 6,
        type: Number,
        minimum: 1,
        maximum: 10,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    score?: number;

    @ApiPropertyOptional({
        description:
            'Разбор раздела: что происходило, что сделано хорошо/плохо и ПОЧЕМУ ' +
            '(причинные цепочки: возражение ← слабое выявление потребностей ← слабый контакт).',
        example:
            'Возражение «дорого» возникло из-за того, что потребности не были выявлены...',
        type: String,
    })
    @IsOptional()
    @IsString()
    analysis?: string;

    @ApiPropertyOptional({
        description:
            'Рекомендации по разделу: как можно/нужно было ответить, какие есть ' +
            'альтернативные варианты, что и как потренировать.',
        example:
            'Ответить: «Понимаю. А чем пользуетесь сейчас?..» Потренировать: 3 варианта ответа на «дорого».',
        type: String,
    })
    @IsOptional()
    @IsString()
    advice?: string;

    @ApiPropertyOptional({
        description:
            '«Как было»: что реально происходило в этом разделе разговора — ' +
            'фактическое поведение менеджера, при возможности с цитатой. ' +
            'Идёт первой строкой записи раздела в таймлайне смарт-элемента.',
        example:
            'Менеджер поздоровался по скрипту, но не представил компанию и сразу перешёл к делу.',
        type: String,
    })
    @IsOptional()
    @IsString()
    asWas?: string;

    @ApiPropertyOptional({
        description:
            '«Что в таком подходе не самое хорошее»: конкретные слабые места ' +
            'подхода менеджера в этом разделе и их последствия.',
        example:
            'Без представления компании собеседник не понимает контекст — растёт недоверие.',
        type: String,
    })
    @IsOptional()
    @IsString()
    weaknesses?: string;

    @ApiPropertyOptional({
        description:
            '«Как можно было по-другому»: 1–3 альтернативных варианта ' +
            'поведения/фраз (каждый элемент массива — отдельный вариант, ' +
            'в таймлайне выводятся нумерованным списком).',
        example: [
            '«Добрый день, компания Гарант, меня зовут…» — полное представление.',
            'Начать с уточнения, удобно ли говорить.',
            'Сослаться на предыдущий контакт/заявку.',
        ],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    alternatives?: string[];
}
