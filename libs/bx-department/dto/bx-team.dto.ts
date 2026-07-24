import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import {
    EBxHrMemberRole,
    EBxHrNodeType,
    IBXHrNodeMember,
} from '@lib/bitrix-v3';
import { EClients } from './bx-department.dto';

/** Группа команды в структуре компании. */
export enum EBxTeamGroup {
    sales = 'sales',
    service = 'service',
}

export class BxTeamRequestDto {
    @ApiProperty({
        enum: EClients,
        description: 'Домен портала Битрикс24.',
        example: EClients.garantservisvoronezh,
        required: true,
    })
    @IsEnum(EClients)
    domain: EClients;

    @ApiProperty({
        enum: EBxTeamGroup,
        description:
            'Группа команды: sales — команда ЦУП (отделы продаж), service — команда Отдел сервиса.',
        example: EBxTeamGroup.sales,
        required: false,
        default: EBxTeamGroup.sales,
    })
    @IsOptional()
    @IsEnum(EBxTeamGroup)
    group?: EBxTeamGroup;

    @ApiProperty({
        description:
            'Сбросить кэш Redis перед запросом: данные будут заново получены из Битрикс и закэшированы.',
        type: Boolean,
        example: false,
        required: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    resetCache?: boolean;
}

export class BxTeamMemberDto implements IBXHrNodeMember {
    @ApiProperty({
        description: 'Идентификатор пользователя Битрикс24.',
        type: Number,
        example: 447,
    })
    userId: number;

    @ApiProperty({
        description: 'Имя и фамилия участника.',
        type: String,
        example: 'Савчук Вадим',
    })
    name: string;

    @ApiProperty({
        description: 'Должность участника.',
        type: String,
        example: 'Руководитель отдела продаж',
        nullable: true,
    })
    workPosition: string | null;

    @ApiProperty({
        enum: EBxHrMemberRole,
        description: 'Роль участника в команде или отделе.',
        example: EBxHrMemberRole.TEAM_HEAD,
    })
    role: EBxHrMemberRole;

    @ApiProperty({
        description: 'Ссылка на аватар.',
        type: String,
        example: 'https://cdn-ru.bitrix24.ru/avatar.png',
        nullable: true,
    })
    avatar: string | null;

    @ApiProperty({
        description: 'Ссылка на профиль пользователя на портале.',
        type: String,
        example: '/company/personal/user/447/',
    })
    url: string;
}

export class BxTeamNodeDto {
    @ApiProperty({
        description: 'Идентификатор узла структуры (команды).',
        type: Number,
        example: 57,
    })
    id: number;

    @ApiProperty({
        description: 'Название команды.',
        type: String,
        example: 'ЦУП',
    })
    name: string;

    @ApiProperty({
        enum: EBxHrNodeType,
        description: 'Тип узла структуры.',
        example: EBxHrNodeType.TEAM,
    })
    type: EBxHrNodeType;

    @ApiProperty({
        description: 'Идентификатор родительского узла.',
        type: Number,
        example: 1,
        nullable: true,
    })
    parentId: number | null;

    @ApiProperty({
        description: 'Описание команды.',
        type: String,
        example: 'Объединяет отделы продаж по территориям',
    })
    description: string;

    @ApiProperty({
        description: 'Количество участников команды.',
        type: Number,
        example: 2,
    })
    userCount: number;

    @ApiProperty({
        description: 'Цвет команды.',
        type: String,
        example: 'blue',
        nullable: true,
    })
    colorName: string | null;

    @ApiProperty({
        description: 'Внешний идентификатор узла.',
        type: String,
        example: 'team-sales',
        nullable: true,
    })
    xmlId: string | null;

    @ApiProperty({
        description: 'Участники команды с ролями.',
        type: [BxTeamMemberDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BxTeamMemberDto)
    members: BxTeamMemberDto[];
}

export class BxTeamTreeDto {
    @ApiProperty({
        description: 'Узел команды с участниками.',
        type: BxTeamNodeDto,
    })
    @ValidateNested()
    @Type(() => BxTeamNodeDto)
    node: BxTeamNodeDto;

    @ApiProperty({
        description:
            'Дочерние команды (например, отделы продаж по территориям).',
        type: [BxTeamTreeDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BxTeamTreeDto)
    children: BxTeamTreeDto[];
}

export class BxTeamResponseDto {
    @ApiProperty({
        description: 'Дерево команды: корень с участниками и подкоманды.',
        type: BxTeamTreeDto,
    })
    @ValidateNested()
    @Type(() => BxTeamTreeDto)
    team: BxTeamTreeDto;
}
