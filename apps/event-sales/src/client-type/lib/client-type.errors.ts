/**
 * Доменные ошибки типа клиента. HTTP-коды ставит сценарий (use-case):
 * 404 — сделки нет, 400 — писать некуда или такого варианта нет на портале.
 */

export class ClientTypeDealNotFoundError extends Error {
    constructor(dealId: number) {
        super(`Сделка ${dealId} не найдена или недоступна`);
        this.name = 'ClientTypeDealNotFoundError';
    }
}

/** Ни у сделки, ни у компании поле «Тип Клиента» не записалось. */
export class ClientTypeNoTargetError extends Error {
    constructor() {
        super(
            'Тип клиента не записан: у сделки и компании нет поля «Тип ' +
                'Клиента» или сделка закрыта, а компании нет.',
        );
        this.name = 'ClientTypeNoTargetError';
    }
}
