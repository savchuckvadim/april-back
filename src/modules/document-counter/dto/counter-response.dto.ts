import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CounterType } from '../lib/counter-type.enum';

export class CounterPivotDto {
    @ApiProperty({ example: 0 })
    value: number | null;

    @ApiProperty({
        enum: CounterType,
        example: CounterType.OFFER,
        nullable: true,
    })
    type: CounterType | null;

    @ApiProperty({ example: 'INV', nullable: true })
    prefix: string | null;

    @ApiProperty({ example: null, nullable: true })
    postfix: string | null;

    @ApiProperty({ example: false })
    day: boolean;

    @ApiProperty({ example: false })
    year: boolean;

    @ApiProperty({ example: false })
    month: boolean;

    @ApiProperty({ example: 5 })
    count: number;

    @ApiProperty({ example: 1 })
    size: number;
}

export class CounterRqDto {
    @ApiProperty({ example: '1' })
    rq_id: string;

    @ApiProperty({ example: 'ООО Рога и Копыта', nullable: true })
    rq_name: string | null;

    @ApiProperty({ example: 0 })
    value: number | null;

    @ApiProperty({
        enum: CounterType,
        example: CounterType.OFFER,
        nullable: true,
    })
    type: CounterType | null;

    @ApiProperty({ example: 'INV', nullable: true })
    prefix: string | null;

    @ApiProperty({ example: null, nullable: true })
    postfix: string | null;

    @ApiProperty({ example: false })
    day: boolean;

    @ApiProperty({ example: false })
    year: boolean;

    @ApiProperty({ example: false })
    month: boolean;

    @ApiProperty({ example: 5 })
    count: number;

    @ApiProperty({ example: 1 })
    size: number;
}

export class CounterResponseDto {
    @ApiProperty({ example: '1' })
    id: string;

    @ApiProperty({ example: 'invoice_counter' })
    name: string;

    @ApiProperty({ example: 'Счётчик счетов' })
    title: string;

    @ApiPropertyOptional({ type: Date, nullable: true })
    created_at: Date | null;

    @ApiPropertyOptional({ type: Date, nullable: true })
    updated_at: Date | null;

    @ApiPropertyOptional({ type: [CounterRqDto] })
    rqs?: CounterRqDto[];
}

export class CounterByRqItemDto {
    @ApiProperty({ example: '1' })
    id: string;

    @ApiProperty({ example: 'invoice_counter' })
    name: string;

    @ApiProperty({ example: 'Счётчик счетов' })
    title: string;

    @ApiProperty({ type: CounterPivotDto })
    pivot: CounterPivotDto;
}

export class DocumentNumberResponseDto {
    @ApiProperty({ example: 'INV-6-04-2026' })
    number: string;
}

export class DeleteCounterResponseDto {
    @ApiProperty({ example: 'Counter and its relations successfully deleted.' })
    message: string;
}
