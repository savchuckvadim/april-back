import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class OfferTemplatePageStickerIdParamsDto {
    @ApiProperty({ description: 'The offer template page sticker id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}
