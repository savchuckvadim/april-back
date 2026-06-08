import { ApiProperty } from '@nestjs/swagger';

/**
 * Ответ эндпоинта постановки холодного звонка.
 *
 * Эндпоинт работает в режиме «тихой» постановки (silence/debounce): он не
 * создаёт задачу/сделки синхронно, а принимает хук, складывает его в буфер
 * по ключу `keyPrefix` и отвечает фактом приёма. Реальная обработка
 * (создание сделок, задачи, элементов KPI) выполняется позже, по событию
 * silence. Поэтому ответ описывает именно факт приёма, а не результат
 * создания сущностей в Bitrix.
 */
export class ColdCallHookResponseDto {
    @ApiProperty({
        description:
            'Признак того, что хук успешно принят и поставлен в silence-буфер ' +
            'на отложенную обработку. Создание сущностей в Bitrix произойдёт ' +
            'асинхронно после окончания окна тишины.',
        example: true,
        type: Boolean,
    })
    accepted: boolean;

    @ApiProperty({
        description:
            'Домен портала Bitrix24, для которого принят холодный звонок. ' +
            'Берётся из тела хука (auth.domain) и определяет таймзону портала ' +
            'при конвертации дедлайна.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Ключ silence-буфера, под которым агрегируются хуки одного ' +
            'ответственного на одном портале до момента отложенной обработки.',
        example: 'XO_event_sales_cold_call_gsr_bitrix24_ru_user_123',
        type: String,
    })
    keyPrefix: string;

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
        description: 'Человекочитаемое сообщение о результате приёма хука.',
        example: 'Холодный звонок принят и поставлен в очередь обработки.',
        type: String,
    })
    message: string;
}
