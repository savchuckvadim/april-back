export type SmartType =
    | 'service_offer'
    | 'service_month'
    // Excel-шаблон смарта презентаций (install/sales/smart/presentation).
    | 'presentation'
    | 'service_act'
    | 'aicall'
    | 'skap'
    | 'zpr'
    // Const-смарт «Презентации» — зеркало сделок «ОП Презентации»
    // (libs/portal-lib/pbx/pbx-presentation-smart). Отдельный от
    // 'presentation' тип: то имя занято Excel-шаблоном выше.
    | 'pres';
