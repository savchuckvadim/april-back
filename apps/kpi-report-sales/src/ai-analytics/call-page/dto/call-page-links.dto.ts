import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, Matches } from 'class-validator';
import { AiRequestBaseDto } from '../../dto/ai-request-base.dto';
import { CALL_PAGE_LINKS_MAX } from '../call-page.const';
import type { CallPageLinkItem } from '../call-page-links.use-case';

/** Номер расшифровки — десятичное целое. */
const TRANSCRIPTION_ID_PATTERN = /^\d{1,18}$/;

/** Запрос ссылок на страницы разбора для списка звонков. */
export class CallPageLinksRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Номера расшифровок звонков из списков витрины (поле ' +
            'transcriptionId). Не больше ста за запрос.',
        type: [String],
        example: ['10245', '10301'],
        maxItems: CALL_PAGE_LINKS_MAX,
    })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(CALL_PAGE_LINKS_MAX)
    @Matches(TRANSCRIPTION_ID_PATTERN, {
        each: true,
        message: 'Номер расшифровки — целое число.',
    })
    transcriptionIds: string[];
}

/** Ссылка на страницу разбора одного звонка. */
export class CallPageLinkItemDto implements CallPageLinkItem {
    @ApiProperty({
        description: 'Номер расшифровки звонка — как в запросе.',
        type: String,
        example: '10245',
    })
    transcriptionId: string;

    @ApiProperty({
        description:
            'Адрес страницы разбора звонка на сайте «Отчёта». Открывается ' +
            'без входа — по подписи в самой ссылке.',
        type: String,
        example:
            'https://next.april-app.ru/call/7wl-3q2x8Yk0mXo1p7cT5vB9nW4sZ6aQeR',
    })
    url: string;
}

/** Ссылки на страницы разбора для запрошенных звонков. */
export class CallPageLinksResponseDto {
    @ApiProperty({
        description:
            'Ссылки для звонков, которые пользователю можно открыть: звонки ' +
            'своего портала и менеджеров из его периметра видимости. ' +
            'Остальные номера в ответ не попадают.',
        type: [CallPageLinkItemDto],
    })
    links: CallPageLinkItemDto[];
}
