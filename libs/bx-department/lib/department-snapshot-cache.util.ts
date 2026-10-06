import type { Dayjs } from 'dayjs';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { BxDepartmentResponseDto } from '../dto/bx-department.dto';
import { DepartmentMode, departmentModeCacheKey } from './department-mode.util';

/**
 * Снимок отдела в Redis живёт двое суток, хотя ключ у него — на день.
 *
 * Ключ с датой меняется в полночь, и раньше утром первые же менеджеры все
 * разом попадали в пустой кэш: каждый запрос сам пересобирал снимок (15–30
 * запросов в Битрикс), до трёх пересборок одновременно (разбор нагрузки
 * 05.10.2026). Теперь первый запрос дня получает ВЧЕРАШНИЙ снимок сразу, а
 * сегодняшний собирается в фоне — для этого вчерашний обязан дожить до
 * конца следующего дня.
 */
export const DEPARTMENT_SNAPSHOT_TTL_SECONDS = 2 * 86400;

/**
 * Мультирежим без единого найденного ОП — скорее ошибка в названиях или
 * тэге: кэшируем ненадолго, чтобы исправление на портале подхватилось.
 */
export const EMPTY_MULTIPLE_TTL_SECONDS = 300;

/**
 * Версия формы ответа в ключе кэша: новые поля не должны ждать полуночи,
 * пока протухнет вчерашний JSON. v2 — parentDepartments и нормализованный
 * UF_HEAD; v3 — список HEADS (структура v3 + UF_HEAD); v4 — режим в ключе,
 * мультирежим ОП (снимок общий со структурой отделов).
 * Менять синхронно с BxDepartmentCacheService.
 */
const CACHE_SHAPE_VERSION = 'v4';

/** Ключ снимка отдела группы на день. */
export const departmentSnapshotKey = (
    domain: string,
    day: Dayjs,
    group: EDepartamentGroup,
    mode: DepartmentMode,
): string =>
    `department_${domain}_${day.format('MMDD')}_${group}_${departmentModeCacheKey(mode)}_${CACHE_SHAPE_VERSION}`;

/** Режим и тэг в ответе — всегда из БД: одиночный ключ тэга не содержит. */
export const withDepartmentMode = (
    snapshot: BxDepartmentResponseDto,
    mode: DepartmentMode,
): BxDepartmentResponseDto => ({
    department: {
        ...snapshot.department,
        isMultiple: mode.isMultiple,
        multipleTag: mode.multipleTag,
    },
});
