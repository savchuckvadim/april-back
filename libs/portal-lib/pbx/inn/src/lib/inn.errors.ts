/**
 * Доменные ошибки ИНН. Библиотека не знает про HTTP — приложение переводит
 * их в коды ответа (404 / 409 / 400) само.
 */

/** Сделка не прочитана: удалена или недоступна интеграции. */
export class InnDealNotFoundError extends Error {
    constructor(dealId: number) {
        super(`Сделка ${dealId} не найдена или недоступна`);
        this.name = 'InnDealNotFoundError';
    }
}

/**
 * Состояние изменилось после того, как человек увидел карточку: робот,
 * крон или соседняя вкладка успели записать своё.
 */
export class InnVersionConflictError extends Error {
    constructor(
        public readonly expected: string,
        public readonly actual: string,
    ) {
        super(
            'Данные по ИНН изменились, пока карточка была открыта — ' +
                'обновите вкладку и повторите выбор.',
        );
        this.name = 'InnVersionConflictError';
    }
}

/** Закрытая сделка — только чтение (решение владельца 17.09.2026). */
export class InnDealClosedError extends Error {
    constructor(dealId: number) {
        super(
            `Сделка ${dealId} закрыта: ИНН договора можно только посмотреть.`,
        );
        this.name = 'InnDealClosedError';
    }
}

/** Значение не ИНН: не прошло контрольную сумму. */
export class InnInvalidValueError extends Error {
    constructor(value: string) {
        super(
            `«${value}» не похоже на ИНН: проверьте число — 10 знаков у ` +
                'юрлица, 12 у ИП и физлица.',
        );
        this.name = 'InnInvalidValueError';
    }
}

/** Скрыть текущий ИНН нельзя — сначала выбирают другой. */
export class InnHideCurrentError extends Error {
    constructor(inn: string) {
        super(
            `ИНН ${inn} сейчас выбран по договору — сначала выберите другой, ` +
                'потом скрывайте этот.',
        );
        this.name = 'InnHideCurrentError';
    }
}
