import { ApiProperty } from '@nestjs/swagger';

/** Значение фильтра списка админки и сколько записей с ним. */
export class AdminFacetValueDto {
    @ApiProperty({
        description: 'Значение поля, как записано в базе.',
        type: String,
        example: 'yandex',
    })
    value: string;

    @ApiProperty({
        description: 'Сколько записей с этим значением.',
        type: Number,
        example: 412,
    })
    count: number;
}
