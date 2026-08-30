import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { EVENT_FLOW_CACHE_APP } from '../../event-report/constants/event-flow.const';
import { SideFlowName } from './side-flow.types';

/** Адрес одного прогона сайд-джоба. */
export interface SideFlowRunRef {
    domain: string;
    flow: SideFlowName;
    /** operationId основного отчёта; пусто — гейт выключен. */
    operationId?: string;
    kind: 'plan' | 'report';
}

/**
 * Состояние прогона:
 *  - `started` — прогон НАЧАТ, а исход неизвестен: воркер оборвался где-то
 *    между этой отметкой и подтверждением, и записал он в Битрикс или нет,
 *    отсюда не видно;
 *  - `done` — прогон завершён, `action`/`elementId` его исход.
 */
export type SideFlowRunStatus = 'started' | 'done';

/** Что этот джоб уже сделал. */
export interface SideFlowRunRecord {
    status: SideFlowRunStatus;
    /** Исход; null — прогон его не подтвердил (`status: 'started'`). */
    action: string | null;
    elementId: number | null;
    /** Когда — только для чтения логов человеком. */
    at: string;
}

/** Исход прогона, которым отметка подтверждается. */
export interface SideFlowRunOutcome {
    action: string;
    elementId: number | null;
}

/**
 * Сколько живёт отметка «этот джоб уже отработал». Сутки: stalled-повтор
 * Bull случается в пределах минут, но отчёт мог уехать в пятницу вечером.
 */
const RUN_TTL_SECONDS = 24 * 60 * 60;

/**
 * Гейт повторной доставки сайд-джоба.
 *
 * Зачем. Сайд-джобы ставятся без retry, но Bull доставляет at-least-once:
 * упади воркер ПОСЛЕ записи в Битрикс — stalled-чекер отдаст джоб заново.
 * Без гейта повтор закрывающего джоба не находит уже закрытый элемент и
 * заводит ВТОРОЙ, спонтанный; повтор переноса удваивает счётчик и ленту
 * комментариев. С ответами портальной анкеты такой дубль стал ещё и
 * заметен владельцу — в нём лежит копия ответов менеджера.
 *
 * ОТМЕТКА СТАВИТСЯ ДО РАБОТЫ, а исходом только подтверждается — иначе гейт
 * не покрывал бы ровно тот случай, ради которого заведён: между записью в
 * Битрикс и отметкой оставалось окно, и падение воркера внутри него давало
 * дубль. Порядок теперь `begin` → работа → `complete`, а повтор, увидевший
 * незавершённое `started`, Битрикс НЕ трогает (см. воркеры потоков).
 *
 * Приём ровно тот же, которым уже защищён основной отчёт
 * ({@link EventFlowProcessor}): отметка в AppCache (Redis + MySQL), и
 * решает её именно ВОРКЕР. Разница одна — у основного отчёта отметка это
 * статус операции, а здесь исход конкретного джоба, поэтому ключ парный:
 * операция + вид джоба (одна операция ставит и `report`, и `plan`).
 *
 * Кэш недоступен — гейт просто не срабатывает: потерять элемент из-за
 * упавшего Redis хуже, чем рискнуть дублем.
 */
@Injectable()
export class SideFlowGuardService {
    private readonly logger = new Logger(SideFlowGuardService.name);

    constructor(private readonly cache: AppCacheService) {}

    /** Отметка прошлого прогона; null — джоб выполняется впервые. */
    async recall(ref: SideFlowRunRef): Promise<SideFlowRunRecord | null> {
        const key = this.keyOf(ref);
        if (!key) return null;
        try {
            const stored = await this.cache.get<Partial<SideFlowRunRecord>>({
                app: EVENT_FLOW_CACHE_APP,
                domain: ref.domain,
                key,
            });
            return stored ? toRecord(stored) : null;
        } catch (error) {
            this.logger.warn(
                `[${ref.flow}] отметка ${key} не прочитана: ` +
                    `${(error as Error).message} — гейт повтора выключен`,
            );
            return null;
        }
    }

    /**
     * Занять прогон ДО первого обращения к Битриксу.
     *
     * Записаться не удалось — работаем всё равно: потерять элемент из-за
     * упавшего Redis хуже, чем рискнуть дублем (правило раздела).
     */
    async begin(ref: SideFlowRunRef): Promise<void> {
        await this.store(
            ref,
            {
                status: 'started',
                action: null,
                elementId: null,
                at: new Date().toISOString(),
            },
            'повтор джоба не будет пойман',
        );
    }

    /** Подтвердить прогон исходом. */
    async complete(
        ref: SideFlowRunRef,
        outcome: SideFlowRunOutcome,
    ): Promise<void> {
        await this.store(
            ref,
            {
                status: 'done',
                action: outcome.action,
                elementId: outcome.elementId,
                at: new Date().toISOString(),
            },
            'повтор джоба увидит прогон незавершённым и Битрикс не тронет',
        );
    }

    private async store(
        ref: SideFlowRunRef,
        record: SideFlowRunRecord,
        failNote: string,
    ): Promise<void> {
        const key = this.keyOf(ref);
        if (!key) return;
        try {
            await this.cache.set({
                app: EVENT_FLOW_CACHE_APP,
                domain: ref.domain,
                key,
                data: record,
                ttlSeconds: RUN_TTL_SECONDS,
            });
        } catch (error) {
            this.logger.warn(
                `[${ref.flow}] отметка ${key} не записана: ` +
                    `${(error as Error).message} — ${failNote}`,
            );
        }
    }

    /**
     * Ключ отметки; пусто — джоб легаси-формы (без operationId), гейт для
     * него выключен и поведение остаётся сегодняшним.
     */
    private keyOf(ref: SideFlowRunRef): string | null {
        if (!ref.operationId) return null;
        return `${ref.flow}:${ref.operationId}:${ref.kind}`;
    }
}

/**
 * Отметка из кэша → запись.
 *
 * Отметка СТАРОЙ формы (без `status`) писалась только после успешной
 * работы — читаем её как подтверждённую: в кэше на момент деплоя лежат
 * отметки суточной давности, и объявить их незавершёнными значило бы
 * молча запретить работу живым повторам.
 */
const toRecord = (stored: Partial<SideFlowRunRecord>): SideFlowRunRecord => ({
    status: stored.status === 'started' ? 'started' : 'done',
    action: stored.action ?? null,
    elementId: stored.elementId ?? null,
    at: stored.at ?? '',
});
