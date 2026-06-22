import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class SetCurrentCounterDto {
    @ApiProperty({
        description:
            'Новое значение счётчика, от которого будет вестись дальнейший отсчёт. ' +
            'Следующий запрос next вернёт номер документа, рассчитанный на основе этого значения.',
        type: Number,
        example: 100,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    @Transform(({ value }) => Number(value))
    value: number;
}
