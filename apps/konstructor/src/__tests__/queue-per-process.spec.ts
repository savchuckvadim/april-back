import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';

/**
 * Конструктор: у каждого процесса своя очередь.
 *
 * Bull берёт следующее задание из очереди без оглядки на его имя и только
 * потом ищет обработчик. Если очередь слушают два класса-обработчика с
 * разными @Process (а тем более два контейнера), задание может достаться
 * тому, у кого нет обработчика этого имени, и упасть с «Missing process
 * handler» без повторов. Так терялась запись сделки 11.11.2026, когда
 * deal-send, КП и КП v2 жили в одной очереди 'konstructor'.
 *
 * Тест читает исходники, а не метаданные: новый обработчик попадает под
 * проверку сам, его не нужно вписывать в список.
 */
const SRC = join(__dirname, '..');

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            return name === '__tests__' ? [] : sourceFiles(full);
        }
        return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
    });

const FILES = sourceFiles(SRC).map(file => ({
    file: relative(SRC, file),
    source: readFileSync(file, 'utf8'),
}));

const PROCESSOR_BY_QUEUE_NAME = /@Processor\(\s*QueueNames\.([A-Z0-9_]+)\s*\)/g;

const processors = FILES.flatMap(({ file, source }) =>
    [...source.matchAll(PROCESSOR_BY_QUEUE_NAME)].map(match => ({
        file,
        queue: match[1],
    })),
);

describe('очереди конструктора: один процесс — одна очередь', () => {
    it('обработчики найдены', () => {
        expect(processors.length).toBeGreaterThan(0);
    });

    it('каждую очередь слушает ровно один класс-обработчик', () => {
        const filesByQueue = new Map<string, string[]>();
        for (const { queue, file } of processors) {
            filesByQueue.set(queue, [...(filesByQueue.get(queue) ?? []), file]);
        }
        const shared = [...filesByQueue].filter(
            ([, files]) => files.length > 1,
        );

        expect(shared).toEqual([]);
    });

    it('запись сделки, КП и КП v2 — в отдельных очередях', () => {
        const queueOf = (fileSuffix: string): string | undefined =>
            processors.find(({ file }) =>
                file.replace(/\\/g, '/').endsWith(fileSuffix),
            )?.queue;

        expect(queueOf('deal-send/processor/deal-send.processor.ts')).toBe(
            'KONSTRUCTOR_DEAL_SEND',
        );
        expect(queueOf('offer-word/queue/offer-generate.processor.ts')).toBe(
            'KONSTRUCTOR_OFFER_GENERATE',
        );
        expect(
            queueOf('offer-word/multi/queue/offer-generate-multi.processor.ts'),
        ).toBe('KONSTRUCTOR_OFFER_GENERATE_MULTI');
    });

    it('обработчики ссылаются только на существующие QueueNames', () => {
        const unknown = processors.filter(
            ({ queue }) => !(queue in QueueNames),
        );

        expect(unknown).toEqual([]);
    });

    it('@Processor объявлен только через QueueNames — иначе тест его не увидит', () => {
        const otherForms = FILES.filter(({ source }) =>
            /@Processor\((?!\s*QueueNames\.)/.test(source),
        ).map(({ file }) => file);

        expect(otherForms).toEqual([]);
    });
});
