import { ApiProperty } from '@nestjs/swagger';
import { CALL_PAGE_TONES, type CallPageTone } from '../call-page.const';

/**
 * Пункт строки «Итогов разговора» с местом в разговоре (задание focus-v3.4):
 * потребность, пункт «хвоста» или блок 5К. Отдаются только пункты, место
 * которых нашлось в расшифровке.
 */
export class CallPageFactItemDto {
    @ApiProperty({
        description:
            'Подпись пункта: потребность или название пункта чек-листа.',
        example: 'Реакция на цену',
        type: String,
    })
    label: string;

    @ApiProperty({
        description:
            'Окраска: good — хорошо, bad — плохо, warn — обратить внимание, ' +
            'neutral — просто сведение.',
        enum: CALL_PAGE_TONES,
        example: 'good',
    })
    tone: CallPageTone;

    @ApiProperty({
        description:
            'Подсветка места в расшифровке (id из `sectionHighlights`) — ' +
            'кнопка «Показать в разговоре».',
        example: 'hvost-2',
        type: String,
    })
    highlightId: string;
}

/** Строка «Итогов разговора»: показатель, значение и места в разговоре. */
export class CallPageFactDto {
    @ApiProperty({
        description: 'Название показателя разговора для строки «Итоги».',
        example: 'Следующий шаг',
        type: String,
    })
    label: string;

    @ApiProperty({
        description: 'Значение словами, готовое к показу.',
        example: 'Показ системы: в четверг в 11:00',
        type: String,
    })
    value: string;

    @ApiProperty({
        description:
            'Окраска значения: good — хорошо, bad — плохо, warn — обратить ' +
            'внимание, neutral — просто сведение.',
        enum: CALL_PAGE_TONES,
        example: 'good',
    })
    tone: CallPageTone;

    @ApiProperty({
        description:
            'Подсветка этого показателя в расшифровке (id из `highlights`): ' +
            'у потребностей, показа и следующего шага — момент разговора, ' +
            'у цены — первая названная цена; null — подсветки нет.',
        example: 'moment-3',
        type: String,
        nullable: true,
    })
    highlightId: string | null;

    @ApiProperty({
        description:
            'Пункты строки с местом в разговоре (задание focus-v3.4): у ' +
            '«Потребностей» — потребности, у «Чек-лист ХВОСТ» и «Чек-лист 5К» ' +
            '— раскрытые пункты; пусто — пунктов с местом нет или прежний разбор.',
        type: [CallPageFactItemDto],
    })
    items: CallPageFactItemDto[];
}
