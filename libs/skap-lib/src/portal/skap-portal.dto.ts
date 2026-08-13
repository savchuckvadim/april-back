import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { SkapImportRun } from 'generated/prisma';
import { SKAP_RUN_STATUSES, SkapRunStatus } from '../store/skap-store.types';

export class SkapPortalRunRequestDto {
    @ApiProperty({
        description:
            'Домен портала Битрикс — запустить прогон импорта СКАП ' +
            '(кнопка «пересчитать» после добавления файлов на Диск)',
        type: String,
        example: 'client.bitrix24.ru',
    })
    @IsString()
    domain!: string;
}

export class SkapPortalRunResponseDto {
    @ApiProperty({
        description:
            'Прогон поставлен в очередь. Если прогон уже идёт — второй не ' +
            'ставится (jobId={domain}:run), это не ошибка',
        type: Boolean,
        example: true,
    })
    queued!: boolean;

    @ApiProperty({
        description: 'ID джоба в очереди skap-import',
        type: String,
        example: 'client.bitrix24.ru:run',
    })
    jobId!: string;
}

export class SkapPortalLastRunDto {
    @ApiProperty({
        description:
            'Статус прогона: running — идёт, done — завершён, ' +
            'stopped_time_budget — остановлен по бюджету, error — упал',
        enum: SKAP_RUN_STATUSES,
        example: 'done',
    })
    status!: SkapRunStatus;

    @ApiProperty({
        description: 'Счётчики прогона (файлы, элементы, сессии, ворнинги)',
        type: Object,
        nullable: true,
        example: { filesProcessed: 2, itemsCreated: 120 },
    })
    stats!: unknown;

    @ApiProperty({
        description: 'Начало прогона',
        type: String,
        format: 'date-time',
        nullable: true,
        example: '2026-08-11T10:00:00.000Z',
    })
    startedAt!: Date | null;

    @ApiProperty({
        description: 'Окончание прогона (null — ещё идёт)',
        type: String,
        format: 'date-time',
        nullable: true,
        example: '2026-08-11T10:04:12.000Z',
    })
    finishedAt!: Date | null;

    static fromRow(row: SkapImportRun): SkapPortalLastRunDto {
        const dto = new SkapPortalLastRunDto();
        dto.status = row.status as SkapRunStatus;
        dto.stats = row.stats;
        dto.startedAt = row.startedAt;
        dto.finishedAt = row.finishedAt;
        return dto;
    }
}

export class SkapPortalStatusResponseDto {
    @ApiProperty({
        description:
            'Импорт сейчас выполняется (индикатор «обновление СКАП» на фронте)',
        type: Boolean,
        example: false,
    })
    running!: boolean;

    @ApiProperty({
        description:
            'Файлов в очереди на обработку (pending + processing) — ' +
            'ненулевое значение с running=false значит «ждёт следующего прогона»',
        type: Number,
        example: 0,
    })
    pendingFiles!: number;

    @ApiProperty({
        description: 'Последний прогон импорта (null — прогонов ещё не было)',
        type: SkapPortalLastRunDto,
        nullable: true,
    })
    lastRun!: SkapPortalLastRunDto | null;

    @ApiProperty({
        description:
            'Ссылка на папку «СКАП. Загрузка» на Диске портала (маленькая ' +
            'ссылка «Хранилище СКАП» рядом с кнопкой «пересчитать»). ' +
            'null — папка ещё не создавалась (не было ни одного прогона)',
        type: String,
        nullable: true,
        example:
            'https://client.bitrix24.ru/workgroups/group/45/disk/path/СКАП. Загрузка/',
    })
    folderUrl!: string | null;

    @ApiProperty({
        description:
            'Ссылка на список элементов смарт-процесса «СКАП» в CRM ' +
            'портала (куда конвейер пишет элементы логин×месяц). ' +
            'null — смарт ещё не установлен на портале',
        type: String,
        nullable: true,
        example: 'https://client.bitrix24.ru/crm/type/183/list/category/0/',
    })
    smartUrl!: string | null;
}
