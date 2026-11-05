import { ApiProperty } from '@nestjs/swagger';
import { MetricDto } from './metric.dto';

/**
 * Части пульса для блока «С кем поработать» (решение владельца
 * 05.11.2026): звонки-примеры менеджера и окно «неделей раньше».
 * Вынесены из ai-pulse.dto ради размера.
 */

/** Звонок-пример окна: ссылка на карточку разбора. */
export class AiPulseCallRefDto {
    @ApiProperty({
        description: 'id транскрипции звонка.',
        type: String,
        example: '91234',
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Начало звонка (ISO); null — время не известно.',
        type: String,
        nullable: true,
        example: '2026-11-03T07:12:00.000Z',
    })
    callStartedAt: string | null;

    @ApiProperty({
        description:
            'Ссылка на карточку разбора в смарте «AI-анализ звонков»; null — ' +
            'элемента ещё нет.',
        type: String,
        nullable: true,
        example: 'https://april.bitrix24.ru/crm/type/1036/details/128/',
    })
    link: string | null;
}

/** Звонки-примеры менеджера: что разобрать и что показать как образец. */
export class AiPulseManagerExamplesDto {
    @ApiProperty({
        description:
            'Свежие разобранные звонки окна без договорённости с датой (до ' +
            'двух) — их руководитель разбирает с менеджером.',
        type: [AiPulseCallRefDto],
    })
    noDate: AiPulseCallRefDto[];

    @ApiProperty({
        description:
            'Свежий звонок окна с договорённостью и датой — образец; null — ' +
            'таких в окне нет.',
        type: AiPulseCallRefDto,
        nullable: true,
    })
    withDate: AiPulseCallRefDto | null;
}

/** Такое же окно перед текущим — для сравнения «неделей раньше». */
export class AiPulsePreviousDto {
    @ApiProperty({
        description: 'Первый рабочий день прошлого окна (YYYY-MM-DD).',
        type: String,
        example: '2026-10-22',
    })
    from: string;

    @ApiProperty({
        description: 'Последний рабочий день прошлого окна (YYYY-MM-DD).',
        type: String,
        example: '2026-10-28',
    })
    to: string;

    @ApiProperty({
        description: 'Разобранных звонков в прошлом окне.',
        type: Number,
        example: 84,
    })
    analyzedCalls: number;

    @ApiProperty({
        description: 'Доля звонков прошлого окна с назначенным шагом и датой.',
        type: MetricDto,
    })
    nextStepDateRate: MetricDto;
}
