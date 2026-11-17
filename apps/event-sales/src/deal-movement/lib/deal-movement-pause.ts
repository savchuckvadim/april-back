/** Пауза между обращениями к Битриксу; ноль — без паузы (спеки). */
export const dealMovementPause = (ms: number): Promise<void> =>
    ms > 0
        ? new Promise(resolve => setTimeout(resolve, ms))
        : Promise.resolve();
