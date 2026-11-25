import { ApiProperty } from '@nestjs/swagger';
import type {
    CallListCallTypeFacet,
    CallListManagerFacet,
} from '../calls-list.types';
import {
    CallsListBadgeFacetDto,
    CallsListMethodologyDto,
    CallsListPointFacetDto,
} from './calls-list-badges.dto';

/** Значение фасета менеджеров. */
export class CallsListManagerFacetDto implements CallListManagerFacet {
    @ApiProperty({
        description: 'Bitrix-id менеджера — значение фильтра managerIds.',
        type: String,
        example: '447',
    })
    id: string;

    @ApiProperty({
        description: 'Имя «Фамилия Имя»; null — имя не прочиталось.',
        type: String,
        nullable: true,
        example: 'Иванова Мария',
    })
    name: string | null;

    @ApiProperty({
        description: 'Разборов этого менеджера за период.',
        type: Number,
        example: 41,
    })
    count: number;
}

/** Значение фасета типов звонка. */
export class CallsListCallTypeFacetDto implements CallListCallTypeFacet {
    @ApiProperty({
        description: 'Код типа — значение фильтра callTypes.',
        type: String,
        example: 'presentation',
    })
    code: string;

    @ApiProperty({
        description: 'Тип словами; null — подписи нет.',
        type: String,
        nullable: true,
        example: 'Презентация',
    })
    title: string | null;

    @ApiProperty({
        description: 'Разборов этого типа за период.',
        type: Number,
        example: 17,
    })
    count: number;
}

/** Фасеты периода — варианты для фильтров. */
export class CallsListFacetsDto {
    @ApiProperty({
        description:
            'Менеджеры с разборами за период (только видимые пользователю), ' +
            'по имени. Фильтры запроса и страница на них не влияют.',
        type: [CallsListManagerFacetDto],
    })
    managers: CallsListManagerFacetDto[];

    @ApiProperty({
        description:
            'Типы звонка с разборами за период, по числу звонков. Фильтры ' +
            'запроса и страница на них не влияют.',
        type: [CallsListCallTypeFacetDto],
    })
    callTypes: CallsListCallTypeFacetDto[];

    @ApiProperty({
        description:
            'Общие бейджи справочника — все, в порядке справочника, со счётчиком ' +
            '«сколько звонков останется, если добавить бейдж» (при остальных ' +
            'выбранных фильтрах).',
        type: [CallsListBadgeFacetDto],
    })
    badges: CallsListBadgeFacetDto[];

    @ApiProperty({
        description:
            'Пункты методики портала — все, в порядке методики, со счётчиками ' +
            '«исполнен» и «не исполнен». Пусто, если методика на портале не ' +
            'включена.',
        type: [CallsListPointFacetDto],
    })
    points: CallsListPointFacetDto[];

    @ApiProperty({
        description:
            'Методика портала; null — методика на портале не включена.',
        type: CallsListMethodologyDto,
        nullable: true,
    })
    methodology: CallsListMethodologyDto | null;
}
