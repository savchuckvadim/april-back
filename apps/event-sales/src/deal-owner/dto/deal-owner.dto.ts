import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import {
    DEAL_OWNER_SKIP_REASONS,
    DealOwnerSkipReason,
} from '../lib/deal-owner-align.plan';
import { IDealOwnerAlignResult } from '../services/deal-owner-align.service';

export class AlignDealOwnerRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс, в котором живёт сделка.',
        type: String,
        example: 'garantservisvoronezh.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Id сотрудника, открывшего сделку в «Звонках». Выравнивание идёт, ' +
            'только если сделка его: чужую сделку смотрят, но клиента этим ' +
            'не забирают.',
        type: Number,
        example: 447,
    })
    @IsInt()
    @Min(1)
    userId: number;
}

export class DealOwnerAlignResultDto implements IDealOwnerAlignResult {
    @ApiPropertyOptional({
        description:
            'На кого переназначены компания и контакты; null — ничего не ' +
            'менялось.',
        type: Number,
        nullable: true,
        example: 447,
    })
    responsibleId: number | null;

    @ApiPropertyOptional({
        description:
            'Почему ничего не менялось: `not_own` — сделка не этого ' +
            'сотрудника, `closed` — сделка закрыта, `aligned` — компания и ' +
            'контакты уже на нём, `recent` — сервер недавно уже выравнивал ' +
            '(в течение 15 минут).',
        enum: DEAL_OWNER_SKIP_REASONS,
        nullable: true,
        example: null,
    })
    skipped: DealOwnerSkipReason | null;

    @ApiProperty({
        description: 'Компания переназначена.',
        type: Boolean,
        example: true,
    })
    companyMoved: boolean;

    @ApiProperty({
        description: 'Сколько контактов переназначено.',
        type: Number,
        example: 2,
    })
    contactsMoved: number;

    @ApiProperty({
        description: 'Что переназначить не удалось.',
        type: [String],
        example: [],
    })
    warnings: string[];
}
