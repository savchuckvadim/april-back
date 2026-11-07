import { ApiProperty } from '@nestjs/swagger';
import type { RqEntity } from '@lib/portal-lib/konstructor/provider';
import type {
    ContractGenerateResult,
    ContractGenerateTemplateProps,
} from '../type/contract-generate.type';

/**
 * Ответ `POST contract/generate` для Swagger/orval.
 *
 * Поля повторяют {@link ContractGenerateResult}: три имени одной ссылки
 * (`link`/`file`/`document`) — контракт легаси-фронта и init-supply; `data`
 * и `provider` оставлены как есть (сужение ответа — отдельное решение с
 * заказчиком, см. комментарий к типу).
 */
export class ContractGenerateResponseDto implements ContractGenerateResult {
    @ApiProperty({
        description:
            'Ссылка на договор: файл на Диске Битрикса (папка сделки / «Договоры»), при сбое Диска — файл на сервере',
    })
    link: string;

    @ApiProperty({
        description:
            'Файл на Диске Битрикса; null — Диск недоступен, в link серверная ссылка',
        type: String,
        nullable: true,
    })
    bitrixLink: string | null;

    @ApiProperty({ description: 'Договор сохранён на Диск Битрикса' })
    savedToDisk: boolean;

    @ApiProperty({ description: 'Файл на сервере; его читает init-supply' })
    file: string;

    @ApiProperty({ description: 'Файл на сервере (легаси-имя поля)' })
    document: string;

    @ApiProperty({ description: 'Имя файла документа' })
    documentName: string;

    @ApiProperty({
        description: 'Данные, подставленные в шаблон договора',
        type: Object,
    })
    data: ContractGenerateTemplateProps;

    @ApiProperty({
        description: 'Реквизиты поставщика, от имени которого собран договор',
        type: Object,
    })
    provider: RqEntity;
}
