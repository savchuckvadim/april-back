import { ApiProperty } from '@nestjs/swagger';

/**
 * Ответ эндпоинта полного event-флоу лида.
 *
 * Эндпоинт работает синхронно (без silence-буфера): к моменту ответа лид
 * уже привязан к компании, а cold-флоу (закрытие старых сделок/задач,
 * создание base/XO сделок, задачи и KPI-элементов) выполнен по компании.
 */
export class LeadColdCallResponseDto {
    @ApiProperty({
        description:
            'Признак того, что флоу лида выполнен: компания найдена или ' +
            'создана, лид привязан, холодный звонок передан в обработку.',
        example: true,
        type: Boolean,
    })
    processed: boolean;

    @ApiProperty({
        description:
            'Домен портала Bitrix24, для которого выполнен флоу. ' +
            'Берётся из тела хука (auth.domain).',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Идентификатор обработанного лида Bitrix.',
        example: 123,
        type: Number,
    })
    leadId: number;

    @ApiProperty({
        description:
            'Идентификатор компании, по которой поставлен холодный звонок: ' +
            'существующая компания лида (COMPANY_ID) либо созданная новая.',
        example: 456,
        type: Number,
    })
    companyId: number;

    @ApiProperty({
        description:
            'Признак того, что компания была создана в рамках этого запроса ' +
            '(у лида не было COMPANY_ID). false — использована существующая.',
        example: false,
        type: Boolean,
    })
    companyCreated: boolean;

    @ApiProperty({
        description:
            'Сырой дедлайн (DD.MM.YYYY HH:mm:ss, локальное время портала) ' +
            'в том виде, в каком он принят эндпоинтом. Возвращается для ' +
            'диагностики TZ-преобразований дедлайна.',
        example: '01.07.2026 02:14:00',
        type: String,
    })
    rawDeadline: string;

    @ApiProperty({
        description: 'Человекочитаемое сообщение о результате обработки.',
        example: 'Лид привязан к компании, холодный звонок поставлен.',
        type: String,
    })
    message: string;
}
