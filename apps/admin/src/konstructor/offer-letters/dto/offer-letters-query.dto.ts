import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Параметры списка писем КП. */
export class OfferLettersQueryDto {
    @ApiProperty({
        description:
            'Портал, чьи письма нужны: и письма портала, и личные письма его менеджеров.',
        type: Number,
        example: 12,
    })
    @IsInt()
    @Min(1)
    portalId: number;
}
