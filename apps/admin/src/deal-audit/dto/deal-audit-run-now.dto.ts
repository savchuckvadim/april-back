import { ApiProperty } from '@nestjs/swagger';

/** Ответ кнопки «Сформировать и отправить» аудита сделок. */
export class DealAuditRunNowAdminResponseDto {
    @ApiProperty({
        description:
            'Поставлен ли новый прогон. false — по этому порталу прогон уже ' +
            'ждёт очереди или идёт, второй не ставится.',
        type: Boolean,
        example: true,
    })
    queued!: boolean;

    @ApiProperty({
        description: 'Домен портала, по которому запущен прогон.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({
        description: 'Что произойдёт дальше — текст для админки.',
        type: String,
        example:
            'Прогон поставлен. Сводки придут сотрудникам через несколько минут, итог — в Telegram.',
    })
    message!: string;

    @ApiProperty({
        description:
            'Предупреждения по настройкам портала: аудит выключен, включено ' +
            '«Только считать», не выбраны получатели.',
        type: [String],
        example: [
            'Включено «Только считать»: карточки не размечаются, сводки не уходят — итог придёт только в Telegram.',
        ],
    })
    notes!: string[];
}
