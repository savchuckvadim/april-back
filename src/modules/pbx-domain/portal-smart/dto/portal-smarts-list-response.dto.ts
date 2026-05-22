import { ApiProperty } from '@nestjs/swagger';
import { PortalSmartRowResponseDto } from './portal-smart-row-response.dto';

/** Портал + список смартов (только строки таблицы `smarts`, без полей/категорий). */
export class PortalSmartsListResponseDto {
    @ApiProperty()
    domain: string;

    @ApiProperty()
    portalId: number;

    @ApiProperty({ type: [PortalSmartRowResponseDto] })
    smarts: PortalSmartRowResponseDto[];
}
