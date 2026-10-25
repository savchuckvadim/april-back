import { ApiProperty } from '@nestjs/swagger';

/**
 * Ответ `POST konstructor/init-supply`.
 *
 * `id_rpa` — контракт легаси-ручки `/rpa/init_supply`, фронт читает его.
 * Файлы в `rpaFields` заменены на `[имя, <base64:длина>]` — вложения
 * обратно не гоняем.
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
}
