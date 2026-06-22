import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CreateCounterData } from '@lib/portal-lib/konstructor';

/**
 * Тело запроса на создание счётчика конструктора (`counters`).
 */
export class CreateCounterDto implements CreateCounterData {
    @ApiProperty({
        description: 'Системное имя счётчика (идентификатор в логике портала)',
        example: 'invoice_number',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Человекочитаемое название счётчика для отображения',
        example: 'Номер счёта',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    title: string;
}
