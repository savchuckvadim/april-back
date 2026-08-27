/**
 * Джоба на создание задач ОРК по поставке.
 *
 * Ставит её konstructor в момент, когда поставка переходит из отдела продаж
 * в отдел сервиса (создана сервисная сделка). Логика самих задач живёт здесь,
 * в event-service: всё, что касается ОРК, — его зона.
 */
export interface OrkSupplyTaskJobDto {
    domain: string;
    /** entityTypeId RPA «Поставка» на портале */
    rpaTypeId: number;
    /** id элемента RPA */
    rpaId: number;
    /** id созданной сервисной сделки — к ней привязываем задачи */
    dealId: number;
}
