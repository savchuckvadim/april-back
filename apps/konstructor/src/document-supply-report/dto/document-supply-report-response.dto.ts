import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Ответы модуля «Отчёт о поставке».
 *
 * Форма ответа подогнана под легаси-фронт: `onlineGeneralAPI.service(..., model)`
 * читает `response.data.data[model]`, где model — 'init' или 'result'.
 * `ResponseInterceptor` уже оборачивает возвращённое в `{resultCode, data}`,
 * поэтому контроллер отдаёт РОВНО `{ init }` и `{ result }` — без своей обёртки
 * `{success, data}`, иначе фронт получит undefined.
 */

/** Ссылки на сгенерированный отчёт. */
export class SupplyReportGenerateResultDto {
    @ApiProperty({
        type: String,
        description:
            'Абсолютная ссылка на docx-файл отчёта. Её же нест кладёт в комментарий таймлайна сделки.',
        example: 'https://api.konstructor.april-app.ru/api/files/<token>',
    })
    link: string;

    @ApiProperty({
        type: String,
        description:
            'Ссылка на документ для отображения. Сейчас совпадает с link — отдельного base64-роута (аналог Laravel supply-report) в несте нет.',
        example: 'https://api.konstructor.april-app.ru/api/files/<token>',
    })
    document: string;

    @ApiProperty({
        type: String,
        description:
            'Ссылка, отдающая сырой файл. Уходит в konstructor/init-supply, где скачивается axios-ом и пишется в RPA-поле supply/current_supply — поэтому обязана быть абсолютной.',
        example: 'https://api.konstructor.april-app.ru/api/files/<token>',
    })
    file: string;

    @ApiPropertyOptional({
        type: String,
        description:
            'Ссылка на PDF-версию отчёта. Отсутствует, если конвертация LibreOffice не удалась — генерация из-за этого не падает.',
    })
    pdfLink?: string;
}

/** Обёртка ответа генерации: ключ result ждёт легаси-фронт. */
export class DocumentSupplyReportGenerateResponseDto {
    @ApiProperty({ type: SupplyReportGenerateResultDto })
    result: SupplyReportGenerateResultDto;
}

/** Обёртка ответа init-формы: ключ init ждёт легаси-фронт. */
export class DocumentSupplyInitFormResponseDto {
    @ApiProperty({
        type: Object,
        description:
            'Данные формы: providers, client{rq,bank,address}, provider, contract[], specification[], clientType, currentComplect, products, consaltingProduct, lt, starProduct, contractType и supply[] — 15 полей формы отчёта (только при isSupplyReport).',
    })
    init: Record<string, unknown>;
}
