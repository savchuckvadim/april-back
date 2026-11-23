import {
    decideXoLaunch,
    XoLaunch,
    XoLaunchDone,
    xoLaunchEntityKey,
} from '../xo-launch.rule';

const launch = (id: string, acceptedAt: number): XoLaunch => ({
    id,
    acceptedAt,
});
const done = (launchId: string, finishedAt: number): XoLaunchDone => ({
    launchId,
    acceptedAt: 0,
    finishedAt,
});

describe('запуск ХО: «выигрывает первый»', () => {
    it('по клиенту ещё не было запусков — работаем', () => {
        expect(decideXoLaunch(launch('L2', 2000), null)).toBe('proceed');
    });

    it('хук принят до выкладки правила (без отметки) — работаем как раньше', () => {
        expect(decideXoLaunch(undefined, done('L1', 5000))).toBe('proceed');
    });

    it('принят, пока выполнялся предыдущий запуск, — повтор, не выполнять', () => {
        // gsr 20.11: первый запуск отработал в 11:22, второй принят в 11:17.
        expect(decideXoLaunch(launch('L2', 2000), done('L1', 5000))).toBe(
            'repeat',
        );
    });

    it('принят после завершения предыдущего — новое решение, работаем', () => {
        expect(decideXoLaunch(launch('L2', 6000), done('L1', 5000))).toBe(
            'proceed',
        );
    });

    it('то же окно пришло второй раз — повторная доставка, молча', () => {
        expect(decideXoLaunch(launch('L1', 1000), done('L1', 5000))).toBe(
            'redelivered',
        );
    });

    it('ключ сущности — тип и id', () => {
        expect(xoLaunchEntityKey('COMPANY', 7)).toBe('company:7');
        expect(xoLaunchEntityKey('deal', '500')).toBe('deal:500');
    });
});
