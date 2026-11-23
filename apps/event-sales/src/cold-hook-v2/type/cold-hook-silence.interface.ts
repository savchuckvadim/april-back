import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../dto/cold.dto';

export interface IColdHookSilenceHandlerData {
    collected: Record<string, IColdCallData>;
    payload: IColdCallPayload;
    /**
     * Ожидание кассы портала (`ColdHooksV2Processor`): сколько раз окно
     * перекладывали, когда его поставили впервые и сказали ли уже в Telegram
     * про долгое ожидание. У впервые поставленного окна полей нет.
     */
    lane?: IColdHookLaneWait;
}

export interface IColdHookLaneWait {
    retries: number;
    /** Время первой постановки окна, мс (Date.now). */
    firstQueuedAt: number;
    alerted: boolean;
}

export interface IColdCallPayload {
    domain: string;
}

/**
 * СЫРЫЕ данные хука — то, что пришло в запросе (см. toColdCallData).
 *
 * Поля события необязательны: робот может не передать их в query, и тогда
 * они читаются из полей карточки, которые он заполнил ПЕРЕД вызовом хука
 * (`xo_name`, `xo_date`, `xo_responsible`, `xo_created`). Слияние —
 * `resolveColdCallData()`, результат — {@link IResolvedColdCallData}.
 *
 * `force` тоже необязателен, и по той же причине: его дефолт нельзя
 * подставить на границе, иначе «робот не сказал» станет неотличимо от
 * «робот сказал N», и поле `op_xo_is_force` уже никогда не сработает.
 */
export interface IColdCallData {
    entityType: EnumColdCallEntityType;
    entityId: string;
    responsible?: string;
    created?: string;
    deadline?: string;
    name?: string;
    isTmc: EnumColdCallIsTmc;
    force?: EnumColdCallForce;
}

/**
 * Данные хука ПОСЛЕ слияния «запрос + карточка»: неопределённостей не
 * осталось, и флоу работают только с ними. Собрать такой объект можно
 * только через `resolveColdCallData()` — она же решает, хватает ли данных.
 */
export interface IResolvedColdCallData extends IColdCallData {
    responsible: string;
    created: string;
    deadline: string;
    name: string;
    force: EnumColdCallForce;
}
