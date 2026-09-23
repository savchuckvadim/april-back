/**
 * Дефолты трендов из реестра параметров (план Фазы 3, П1; коды группы
 * `trend_params` — `params/registry.mapping.const.ts`): величины берутся
 * `registryDefault`, а не литералами (находка M8 аудита Фазы 2,
 * `lib-defaults.spec`); контекст портала переопределяет их через
 * `resolveNumberParam` тех же кодов на стороне шага конвейера.
 */
import { registryDefault } from '../../params/registry.access';

export const TREND_DEFAULTS = {
    /** `trend_ewma_short`. */
    alphaShort: registryDefault('trend_ewma_short'),
    /** `trend_ewma_long`. */
    alphaLong: registryDefault('trend_ewma_long'),
    /** `trend_sigma_k` — нижняя граница порога дрейфа k (единицы σ). */
    sigmaK: registryDefault('trend_sigma_k'),
    /** `trend_fwer` — допустимая вероятность хотя бы одного ложного флага. */
    fwer: registryDefault('trend_fwer'),
    /** `trend_window_calls` — минимум разборов менеджера в окне ряда. */
    windowCalls: registryDefault('trend_window_calls'),
    /** `xmr_sigma` — множитель MR̄ для границ выброса. */
    xmrSigma: registryDefault('xmr_sigma'),
    /** `calibration_comparable_weeks` — гейт показа после разрыва ряда. */
    comparableWeeks: registryDefault('calibration_comparable_weeks'),
    /**
     * Опорное смещение k табличного CUSUM в единицах σ (Пейдж: k = δ/2
     * для сдвига δ = 1σ) и нижняя граница порога h. Не параметр реестра:
     * константы метода, сам порог h калибруется перестановками.
     */
    cusumK: 0.5,
    cusumH: 4,
    /**
     * Точек базовой линии для μ0 CUSUM и минимум сравнимых точек ряда.
     * Не параметр реестра: константы метода — базовая линия и есть
     * минимум, с которого CUSUM определён.
     */
    baselinePoints: 8,
    minPoints: 8,
    /** От скольких точек доверие ok. Не параметр реестра: удвоенный минимум. */
    okPoints: 16,
    /**
     * Окон подряд над порогом для флага дрейфа (описание `trend_sigma_k`:
     * «два окна подряд»). Не параметр реестра: константа метода.
     */
    consecutive: 2,
    /**
     * Перемешиваний калибровки порогов. Не параметр реестра: точность
     * самой проверки, как у перестановочного теста утечек (200).
     */
    iterations: 200,
    /**
     * Самое большее столько последних точек текущего выброса ряд не
     * кладёт в собственный пул перестановок: свежий сдвиг не должен
     * калибровать сам себя. Не параметр реестра: константа метода
     * (окно «сигнал не позже 3-й недели» плюс запас в одну точку).
     */
    holdoutPoints: 4,
} as const;
