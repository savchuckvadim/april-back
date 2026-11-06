import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { parseCrmEntityId } from '../lib/crm-entity-id.util';

/** Блок `auth`, который исходящий вебхук Битрикса добавляет к запросу. */
export class TmcPresentationApprovedAuthDto {
    @ApiPropertyOptional({
        description:
            'Домен портала из блока авторизации вебхука (`auth[domain]`).',
        type: String,
        example: 'gsr.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    domain?: string;
}

/**
 * Параметры робота «Заявка на презентацию согласована» (бизнес-процесс
 * РПА на портале). Робот шлёт их формой либо строкой запроса — ручка
 * принимает оба; обязательность проверяется сервисом с понятным текстом
 * ошибки для журнала бизнес-процесса.
 */
export class TmcPresentationApprovedDto {
    @ApiPropertyOptional({
        description:
            'Домен портала, если робот передаёт его отдельным параметром ' +
            '(иначе берётся из `auth[domain]`).',
        type: String,
        example: 'gsr.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({
        description: 'Блок авторизации исходящего вебхука Битрикса.',
        type: TmcPresentationApprovedAuthDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => TmcPresentationApprovedAuthDto)
    auth?: TmcPresentationApprovedAuthDto;

    @ApiPropertyOptional({
        description:
            'ТМЦ-сделка, из которой подана заявка (поле РПА «ТМЦ Сделка»): ' +
            'голый id либо привязка вида D_216773.',
        type: Number,
        example: 213065,
    })
    @IsOptional()
    @Transform(({ obj }) =>
        parseCrmEntityId((obj as Record<string, unknown>).tmcDealId),
    )
    @IsInt()
    tmcDealId?: number;

    @ApiPropertyOptional({
        description:
            'Компания клиента (поле РПА «Компания»): голый id либо CO_95857.',
        type: Number,
        example: 48210,
    })
    @IsOptional()
    @Transform(({ obj }) =>
        parseCrmEntityId((obj as Record<string, unknown>).companyId),
    )
    @IsInt()
    companyId?: number;

    @ApiPropertyOptional({
        description:
            'Контакт, с которым договорились о презентации (поле РПА «Контакт»).',
        type: Number,
        example: 91022,
    })
    @IsOptional()
    @Transform(({ obj }) =>
        parseCrmEntityId((obj as Record<string, unknown>).contactId),
    )
    @IsInt()
    contactId?: number;

    @ApiPropertyOptional({
        description:
            'Руководитель, утвердивший заявку — постановщик плана. Формат ' +
            'бизнес-процесса `user_12` либо голый id.',
        type: String,
        example: 'user_1',
    })
    @IsOptional()
    @Type(() => String)
    @IsString()
    ownerId?: string;

    @ApiPropertyOptional({
        description:
            'Менеджер ОП, которому назначена презентация (поле РПА «ОП Кто ' +
            'назначен ответственным»). Формат `user_12` либо голый id.',
        type: String,
        example: 'user_187',
    })
    @IsOptional()
    @Type(() => String)
    @IsString()
    managerId?: string;

    @ApiPropertyOptional({
        description:
            'ТМЦ-менеджер, подавший заявку (поле РПА «ТМЦ Кто назначил ' +
            'последнюю заявку на презентацию»). Формат `user_12` либо голый id.',
        type: String,
        example: 'user_251',
    })
    @IsOptional()
    @Type(() => String)
    @IsString()
    tmcId?: string;

    @ApiPropertyOptional({
        description:
            'Дата и время презентации в локали портала (поле РПА «ОП Дата ' +
            'назначенной презентации»), `DD.MM.YYYY HH:mm:ss`.',
        type: String,
        example: '15.11.2026 14:30:00',
    })
    @IsOptional()
    @IsString()
    deadline?: string;

    @ApiPropertyOptional({
        description: 'Название заявки — станет названием презентации и задачи.',
        type: String,
        example: 'Заявка Презентация Иванов от 02.11.2026 10:00:00',
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Комментарий руководителя к заявке.',
        type: String,
        example: 'Согласовано, взять с собой прайс',
    })
    @IsOptional()
    @IsString()
    commentOwner?: string;

    @ApiPropertyOptional({
        description: 'Комментарий ТМЦ-менеджера к заявке.',
        type: String,
        example: 'Директор просил показать систему бухгалтеру',
    })
    @IsOptional()
    @IsString()
    commentTMC?: string;

    @ApiPropertyOptional({
        description: 'Комментарий менеджера ОП к заявке.',
        type: String,
        example: 'Подтвердил время с клиентом',
    })
    @IsOptional()
    @IsString()
    commentManager?: string;
}
