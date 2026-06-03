import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export enum OfferWordEphemeralPdfStatusEnum {
    PENDING = 'pending',
    READY = 'ready',
    FAILED = 'failed',
}

export class OfferWordEphemeralPdfStartResponseDto {
    @ApiProperty({
        description:
            'Идентификатор операции: GET /offer-word-pdf-preview/:operationId и DELETE для отмены',
    })
    @IsString()
    operationId: string;

    constructor(operationId: string) {
        this.operationId = operationId;
    }
}

export class OfferWordEphemeralPdfStopResponseDto {
    @ApiProperty()
    @IsString()
    operationId: string;

    @ApiProperty({
        description:
            'true — отмена учтена (очередь/Redis); активная задача может ещё коротко поработать до проверки флага',
    })
    @IsBoolean()
    cancelled: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    message?: string;

    constructor(operationId: string, cancelled: boolean, message?: string) {
        this.operationId = operationId;
        this.cancelled = cancelled;
        this.message = message;
    }
}

export class OfferWordEphemeralPdfPollResponseDto {
    @ApiProperty({ enum: OfferWordEphemeralPdfStatusEnum })
    @IsEnum(OfferWordEphemeralPdfStatusEnum)
    status: OfferWordEphemeralPdfStatusEnum;

    @ApiPropertyOptional({
        description:
            'При status=ready; тот же PDF можно запрашивать повторно, пока не истёк TTL ключа в Redis',
    })
    pdfBase64?: string;

    @ApiPropertyOptional({ example: 'offer-uuid.pdf' })
    fileName?: string;

    @ApiPropertyOptional({ example: 'application/pdf' })
    mimeType?: string;

    @ApiPropertyOptional()
    error?: string;
}
