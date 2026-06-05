import { Type } from 'class-transformer';
import { ValidateNested, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresentationCountDto {
    @ApiProperty({
        description: 'Количество презентаций, привязанных к компании.',
        type: Number,
        example: 2,
    })
    @IsNumber()
    company: number;

    @ApiProperty({
        description: 'Количество презентаций, привязанных к смарт-процессу.',
        type: Number,
        example: 1,
    })
    @IsNumber()
    smart: number;

    @ApiProperty({
        description: 'Количество презентаций, привязанных к сделке.',
        type: Number,
        example: 3,
    })
    @IsNumber()
    deal: number;
}

export class PresentationDto {
    @ApiProperty({
        description: 'Счётчики презентаций по типам привязки.',
        type: PresentationCountDto,
    })
    @ValidateNested()
    @Type(() => PresentationCountDto)
    count: PresentationCountDto;

    @ApiProperty({
        description: 'Признак того, что презентация была проведена.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isPresentationDone: boolean;

    @ApiProperty({
        description: 'Признак внеплановой (незапланированной) презентации.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    isUnplannedPresentation: boolean;
}
