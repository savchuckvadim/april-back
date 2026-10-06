/**
 * Кто сейчас обращается в Битрикс: менеджер у экрана или фоновая работа.
 *
 * Сам механизм общий и живёт в ядре (`@/core/call-context`): класс работы
 * лежит в асинхронном контексте, HTTP-запросы помечаются интерактивом
 * автоматически, всё остальное — фон. Здесь — имена в терминах Битрикса:
 * ограничитель запросов и ядро вызова читают класс отсюда.
 *
 * Экземпляр Bitrix при этом ни с кем не шарится и о классе не знает:
 * правило проекта «экземпляр живёт в пределах одного вызова» не затронуто.
 */
export {
    CALL_CLASS as BITRIX_CALL_CLASS,
    getCallContext as getBitrixCallContext,
    runAsBackground,
    runAsInteractive,
    runWithCallContext as runWithBitrixCallContext,
} from '@/core/call-context/call-context';
export type {
    CallClass as BitrixCallClass,
    CallContext as BitrixCallContext,
} from '@/core/call-context/call-context';
