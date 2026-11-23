import { ApiProperty } from '@nestjs/swagger';

/**
 * Ответ `POST konstructor/init-supply`.
 *
 * `id_rpa` — контракт легаси-ручки `/rpa/init_supply`, фронт читает его.
 * Файлы в `rpaFields` заменены на `[имя, <base64:длина>]` — вложения
 * обратно не гоняем.
 *
 * `diskFolderUrl` и `diskWarning` — результат дополнительной выкладки
 * документов на Диск: сбой Диска заявку не роняет.
 */
export class InitSupplyResponseDto {
    @ApiProperty({
        description: 'Id элемента RPA «Поставка» (созданного или обновлённого)',
        type: Number,
        nullable: true,
    })
    id_rpa: number | null;

    @ApiProperty({
        description: 'Описание RPA-типа из слепка портала',
        type: Object,
        nullable: true,
    })
    rpaDb: object | null;

    @ApiProperty({ description: 'Id RPA-типа «Поставка» на портале' })
    rpaTypeId: number;

    @ApiProperty({
        description: 'Элемент RPA, как его вернул Битрикс',
        type: Object,
        nullable: true,
    })
    rpaResponse: object | null;

    @ApiProperty({
        description: 'Коды файловых полей сделки, в которые легли документы',
        type: [String],
    })
    dealFileFields: string[];

    @ApiProperty({
        description: 'Поля, записанные в RPA (файлы — без содержимого)',
        type: Object,
    })
    rpaFields: Record<string, unknown>;

    @ApiProperty({
        description:
            'Ссылка на папку документов заявки на Диске Битрикса ' +
            '(«Поставка {id заявки}» или «Перезаключение {id заявки}» в папке сделки). ' +
            'Пусто (null), если документы на Диск не легли: причина в diskWarning',
        type: String,
        nullable: true,
        required: false,
    })
    diskFolderUrl: string | null;

    @ApiProperty({
        description:
            'Причина, если Диск принял документы не полностью или не принял вовсе. ' +
            'Заявка при этом создана, файловые поля заполнены',
        type: String,
        required: false,
    })
    diskWarning?: string;
}
