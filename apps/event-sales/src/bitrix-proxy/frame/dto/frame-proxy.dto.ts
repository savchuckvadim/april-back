import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';

const METHOD_DESCRIPTION =
    'Имя метода REST API Битрикс24 — тот же метод, который фрейм вызвал ' +
    'бы сам. Выполняются только методы приложения «Звонки»; удаление, ' +
    'правка пользователей и настроек CRM отклоняются.';

/** Общая часть запросов фрейма: чей портал и кто просит. */
export class FrameProxyBaseDto {
    @ApiProperty({
        description:
            'Домен портала Битрикс24. Должен совпадать с доменом сессии ' +
            '(Bearer-токен portal-context).',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'ID пользователя Битрикс24, который работает во фрейме. Должен ' +
            'совпадать с пользователем сессии — по нему ведётся журнал.',
        example: '447',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    requesterUserId: string;
}

/** Один вызов метода Битрикса через сервер. */
export class FrameProxyCallDto extends FrameProxyBaseDto {
    @ApiProperty({
        description: METHOD_DESCRIPTION,
        example: 'crm.company.update',
        type: String,
    })
    @IsString()
    @Matches(/^[a-zA-Z][a-zA-Z0-9._]*$/, {
        message: 'method — имя метода Битрикса (латиница, цифры, точки)',
    })
    method: string;

    @ApiPropertyOptional({
        description:
            'Параметры метода в том виде, в каком их ждёт REST API ' +
            '(id, fields, filter, select…). Передаются без изменений.',
        type: Object,
        example: { id: 177317, fields: { ASSIGNED_BY_ID: 459 } },
    })
    @IsOptional()
    @IsObject()
    params?: Record<string, unknown>;
}

/** Пакет команд Битрикса через сервер (до 50 за один batch). */
export class FrameProxyBatchDto extends FrameProxyBaseDto {
    @ApiProperty({
        description:
            'Команды пакета: ключ — имя команды, значение — { method, ' +
            'params }. Ссылки на результат соседней команды ' +
            '(`$result[ключ]`) работают как в обычном batch. ' +
            METHOD_DESCRIPTION,
        type: 'object',
        additionalProperties: {
            type: 'object',
            properties: {
                method: { type: 'string' },
                params: { type: 'object' },
            },
        },
        example: {
            company: {
                method: 'crm.company.update',
                params: { id: 177317, fields: { ASSIGNED_BY_ID: 459 } },
            },
        },
    })
    @IsObject()
    commands: Record<string, FrameProxyCommand>;
}

/** Команда пакета в форме фрейма. */
export interface FrameProxyCommand {
    method: string;
    params?: Record<string, unknown>;
}

/** Ответ одного вызова: как у фрейма — ответ Битрикса или его ошибка. */
export class FrameProxyCallResponseDto {
    @ApiProperty({
        description: 'Вызов выполнен: true — в answer ответ Битрикса.',
        example: true,
        type: Boolean,
    })
    ok: boolean;

    @ApiPropertyOptional({
        description:
            'Полный ответ Битрикса ({ result, total, next, time }), когда ' +
            'ok = true.',
        type: Object,
        example: { result: true },
    })
    answer?: Record<string, unknown>;

    @ApiPropertyOptional({
        description: 'Код ошибки Битрикса, когда ok = false.',
        example: 'ACCESS_DENIED',
        type: String,
    })
    error?: string;

    @ApiPropertyOptional({
        description: 'Описание ошибки Битрикса, когда ok = false.',
        example: 'Access denied.',
        type: String,
    })
    errorDescription?: string;
}

/** Ответ пакета: результаты и ошибки по ключам команд. */
export class FrameProxyBatchResponseDto {
    @ApiProperty({
        description: 'Результаты успешных команд по их ключам.',
        type: Object,
        example: { company: true },
    })
    result: Record<string, unknown>;

    @ApiProperty({
        description:
            'Ошибки команд по их ключам: { error, error_description } — ' +
            'как result_error у Битрикса.',
        type: Object,
        example: {},
    })
    errors: Record<string, unknown>;

    @ApiProperty({
        description: 'Всего записей по ключам команд-списков (result_total).',
        type: Object,
        example: {},
    })
    total: Record<string, unknown>;

    @ApiProperty({
        description: 'Смещение следующей страницы по ключам (result_next).',
        type: Object,
        example: {},
    })
    next: Record<string, unknown>;
}
