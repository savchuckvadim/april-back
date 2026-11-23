import {
    batchCommandsOf,
    formatCommandsLine,
    parseBatchCommand,
    summarizeBatchCommands,
} from '../bitrix-batch-commands.util';

describe('parseBatchCommand — команда пачки', () => {
    it('метод, запись и id из параметров', () => {
        expect(
            parseBatchCommand(
                'set_deal',
                'crm.deal.update?id=26735&fields[TITLE]=Иванов',
            ),
        ).toEqual({
            key: 'set_deal',
            method: 'crm.deal.update',
            write: true,
            entityId: '26735',
        });
    });

    it('ID заглавными и ссылка $result тоже читаются как id', () => {
        expect(parseBatchCommand('a', 'crm.item.get?ID=7').entityId).toBe('7');
        expect(
            parseBatchCommand('b', 'crm.deal.update?id=$result[set_deal]')
                .entityId,
        ).toBe('$result[set_deal]');
    });

    it('без параметров и без id — только метод', () => {
        expect(parseBatchCommand('t', 'server.time')).toEqual({
            key: 't',
            method: 'server.time',
            write: false,
        });
        expect(
            parseBatchCommand('k', 'lists.element.add?IBLOCK_ID=5'),
        ).not.toHaveProperty('entityId');
    });
});

describe('batchCommandsOf — команды из тела вызова batch', () => {
    it('берёт строки cmd, остальное пропускает', () => {
        const commands = batchCommandsOf({
            halt: 0,
            cmd: { a: 'crm.deal.get?id=1', b: 42 },
        });

        expect(commands.map(command => command.key)).toEqual(['a']);
    });

    it.each([undefined, null, 'batch', { halt: 0 }, { cmd: null }])(
        'не пачка (%p) — пусто',
        data => {
            expect(batchCommandsOf(data)).toEqual([]);
        },
    );
});

describe('summarizeBatchCommands / formatCommandsLine', () => {
    const commands = [
        parseBatchCommand('set_deal', 'crm.deal.update?id=1'),
        parseBatchCommand('kpi_1', 'lists.element.add?a=1'),
        parseBatchCommand('kpi_2', 'lists.element.add?a=2'),
        parseBatchCommand('task', 'tasks.task.add?fields[TITLE]=x'),
        parseBatchCommand('kpi_3', 'lists.element.add?a=3'),
        parseBatchCommand('read_deal', 'crm.deal.get?id=1'),
        parseBatchCommand('kpi_4', 'lists.element.add?a=4'),
    ];

    it('сводка по сущностям — частые первыми; первые пять ключей', () => {
        expect(summarizeBatchCommands(commands)).toEqual({
            total: 7,
            writes: 6,
            summary: 'строка списка ×4, сделка ×2, задача ×1',
            keys: ['set_deal', 'kpi_1', 'kpi_2', 'task', 'kpi_3'],
        });
    });

    it('строка тревоги: смешанная пачка — сколько записи и чтения, остаток ключей', () => {
        expect(formatCommandsLine(summarizeBatchCommands(commands))).toBe(
            'Команды (7, запись 6, чтение 1): строка списка ×4, сделка ×2, задача ×1 · ' +
                'ключи: set_deal, kpi_1, kpi_2, task, kpi_3 …ещё 2',
        );
    });

    it('только чтение — пометка «чтение»', () => {
        const reads = [parseBatchCommand('d', 'crm.deal.list?start=0')];

        expect(formatCommandsLine(summarizeBatchCommands(reads))).toBe(
            'Команды (1, чтение): сделка ×1 · ключи: d',
        );
    });

    it('длинные ключи обрезаются, групп не больше шести', () => {
        const many = Array.from({ length: 8 }, (_, i) =>
            parseBatchCommand(`${'k'.repeat(60)}_${i}`, `m${i}.do?x=1`),
        );
        const summary = summarizeBatchCommands(many);

        expect(summary.keys[0]).toHaveLength(40);
        expect(summary.keys[0].endsWith('…')).toBe(true);
        expect(summary.summary.split(', ')).toHaveLength(7);
        expect(summary.summary.endsWith('…')).toBe(true);
    });
});
