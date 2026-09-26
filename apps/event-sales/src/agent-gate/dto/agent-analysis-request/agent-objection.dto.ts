import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import {
    CALL_REPORT_OBJECTION_CODES,
    CallReportObjectionCode,
} from '@lib/call-lib';
import {
    CALL_REPORT_OBJECTION_REACTIONS,
    type CallReportObjectionReaction,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

/**
 * Возражение клиента и его отработка — вынесено из общего файла контракта
 * агента (лимит файла); имена и декораторы прежние, реэкспорт через барель.
 */

/** Возражение клиента и как менеджер его отработал. */
export class AgentObjectionDto {
    @ApiProperty({
        description: 'Формулировка возражения клиента из разговора.',
        example: 'Дорого, у нас уже есть КонсультантПлюс',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    objection: string;

    @ApiPropertyOptional({
        description: 'Как менеджер отработал возражение (если отработал).',
        example: 'Предложил сравнение тарифов и демо-доступ',
        type: String,
    })
    @IsOptional()
    @IsString()
    handling?: string;

    @ApiPropertyOptional({
        description: 'Оценка агента: возражение отработано успешно.',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    handled?: boolean;

    @ApiPropertyOptional({
        description:
            'Категория возражения по закрытому справочнику (для трендов).',
        enum: CALL_REPORT_OBJECTION_CODES,
        example: 'price',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_OBJECTION_CODES as unknown as string[])
    category?: CallReportObjectionCode;

    @ApiPropertyOptional({
        description:
            'Цитата-доказательство из транскрипта (дословная фраза клиента).',
        example: 'Да у нас Консультант стоит, зачем нам второй',
        type: String,
    })
    @IsOptional()
    @IsString()
    quote?: string;

    @ApiPropertyOptional({
        description:
            'Исход после ответа менеджера: разговор продолжился конструктивно / ' +
            'клиент согласился / разговор свернулся. Замыкает петлю ' +
            '«ответ → исход» для библиотеки лучших ответов.',
        enum: ['continued', 'converted', 'disengaged'],
        example: 'continued',
    })
    @IsOptional()
    @IsString()
    @IsIn(['continued', 'converted', 'disengaged'])
    outcome?: 'continued' | 'converted' | 'disengaged';

    @ApiPropertyOptional({
        description:
            'Секунда начала цитаты по расшифровке с таймкодами (Фаза 3, ' +
            'П6); null — меток в расшифровке не было.',
        type: Number,
        nullable: true,
        example: 134,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    startSec?: number | null;

    @ApiPropertyOptional({
        description: 'Секунда конца цитаты; null — меток не было.',
        type: Number,
        nullable: true,
        example: 141,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    endSec?: number | null;

    @ApiPropertyOptional({
        description:
            'Первая реакция менеджера на возражение (ось стиля, П8): ' +
            'answer — ответил по существу, clarify — уточнил вопросом, ' +
            'other — иное или не отреагировал.',
        enum: CALL_REPORT_OBJECTION_REACTIONS,
        nullable: true,
        example: 'clarify',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_OBJECTION_REACTIONS as unknown as string[])
    reaction?: CallReportObjectionReaction | null;
}
