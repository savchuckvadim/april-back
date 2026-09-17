import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
    LEAD_CLIENT_KINDS,
    LeadClientKind,
} from '../../../shared/lead-client/lead-client.types';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

const KIND_DESCRIPTION =
    'Кем сделать лид: contact — контакт (только у лида без компании и ' +
    'контакта), company — компания (у лида без компании, контакт ' +
    'сохраняется и становится её сотрудником). Не передан — решают ' +
    'настройки портала: лид-организация в «отделах компаний» → компания, ' +
    'иначе контакт.';

/** Query вебхука робота «клиент из лида». */
export class LeadClientWebhookQueryDto {
    @ApiProperty({
        description: 'Идентификатор сделки Bitrix, лиды которой обрабатываем.',
        example: 81457,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dealId: number;

    @ApiPropertyOptional({
        description: KIND_DESCRIPTION,
        example: 'contact',
        type: String,
        enum: LEAD_CLIENT_KINDS,
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_CLIENT_KINDS as unknown as string[])
    kind?: LeadClientKind;
}

/** Тело ручного запуска «клиент из лида» (кнопка, отладка). */
export class LeadClientRunDto extends SalesHookRunRequestBaseDto {
    @ApiProperty({
        description: 'Идентификатор сделки Bitrix, лиды которой обрабатываем.',
        example: 81457,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dealId: number;

    @ApiPropertyOptional({
        description: KIND_DESCRIPTION,
        example: 'company',
        type: String,
        enum: LEAD_CLIENT_KINDS,
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_CLIENT_KINDS as unknown as string[])
    kind?: LeadClientKind;
}

/** Элемент пачки — внутренний контракт. */
export interface ILeadClientItem {
    dealId: number;
    kind?: LeadClientKind;
}
