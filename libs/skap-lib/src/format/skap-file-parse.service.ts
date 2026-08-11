import { Injectable } from '@nestjs/common';
import {
    SKAP_DETAIL_COLUMNS_V1,
    SKAP_DETAIL_REQUIRED_V1,
    SKAP_ONLINE_COLUMNS_V1,
    SKAP_ONLINE_REQUIRED_V1,
    SKAP_PRIME_LENT_ACTIVE_VALUE,
    SKAP_PRIME_LENT_COLUMNS_V1,
    SKAP_PRIME_LENT_REQUIRED_V1,
} from './skap-format-v1.const';
import {
    decodeSkapBuffer,
    detectSkapFileKind,
    parseSkapRuDateTime,
    parseSkapTimedeltaToMs,
    skapCsvToRows,
} from './skap-decode.util';
import {
    buildSkapHeaderMap,
    pickCell,
    SkapHeaderMap,
} from './skap-header-map.util';
import {
    SKAP_FORMAT_VERSIONS,
    SkapDetailRow,
    SkapFileKind,
    SkapFormatError,
    SkapFormatWarning,
    SkapOnlineRow,
    SkapParsedAnyFile,
    SkapPrimeLentRow,
} from './skap-format.types';

/**
 * Парсер выгрузок СКАП (Online / Online_detail / Prime_lent) с
 * header-map защитой от смены формата. Вход — строки ячеек
 * (csv уже разбит по `;`, xlsx — по ячейкам), выход — typed-строки.
 */
@Injectable()
export class SkapFileParseService {
    /** Буфер csv/txt → typed-строки (вид файла — по имени). */
    parseCsvBuffer(buffer: Buffer, fileName: string): SkapParsedAnyFile {
        const kind = detectSkapFileKind(fileName);
        if (!kind) {
            throw new SkapFormatError(
                null,
                `Файл «${fileName}» не распознан как выгрузка СКАП ` +
                    '(ожидается *Online.csv / *Online_detail.csv / *Prime_lent.csv)',
            );
        }
        const rows = skapCsvToRows(decodeSkapBuffer(buffer));
        return this.parseRows(kind, rows);
    }

    /** Строки ячеек → typed-строки нужного вида. */
    parseRows(kind: SkapFileKind, rows: string[][]): SkapParsedAnyFile {
        if (!rows.length) {
            throw new SkapFormatError(kind, `Файл ${kind} пуст`);
        }
        switch (kind) {
            case 'online':
                return { kind, ...this.parseOnline(rows) };
            case 'online_detail':
                return { kind, ...this.parseDetail(rows) };
            case 'prime_lent':
                return { kind, ...this.parsePrimeLent(rows) };
        }
    }

    private parseOnline(rows: string[][]) {
        const map = buildSkapHeaderMap(
            'online',
            rows[0],
            SKAP_ONLINE_COLUMNS_V1,
            SKAP_ONLINE_REQUIRED_V1,
        );
        const { dataRows, warnings } = this.splitData(rows, map, 6);
        const parsed: SkapOnlineRow[] = dataRows.map(row => ({
            regList: pickCell(row, map, 'regList'),
            rpName: pickCell(row, map, 'rpName'),
            clientCard: pickCell(row, map, 'clientCard'),
            clientName: pickCell(row, map, 'clientName'),
            complectArmId: pickCell(row, map, 'complectArmId'),
            supplyKind: pickCell(row, map, 'supplyKind'),
            complectType: pickCell(row, map, 'complectType'),
            netCoef: pickCell(row, map, 'netCoef'),
            loginCreated: parseSkapRuDateTime(
                pickCell(row, map, 'loginCreated'),
            ),
            login: pickCell(row, map, 'login'),
            sessionCount: parseInt(pickCell(row, map, 'sessionCount'), 10) || 0,
            ipCount: parseInt(pickCell(row, map, 'ipCount'), 10) || 0,
            ipList: pickCell(row, map, 'ipList'),
            timeMs: parseSkapTimedeltaToMs(pickCell(row, map, 'timeMs')),
        }));
        return {
            formatVersion: SKAP_FORMAT_VERSIONS.online,
            rows: parsed.filter(row => row.clientCard && row.login),
            warnings,
        };
    }

    private parseDetail(rows: string[][]) {
        const map = buildSkapHeaderMap(
            'online_detail',
            rows[0],
            SKAP_DETAIL_COLUMNS_V1,
            SKAP_DETAIL_REQUIRED_V1,
        );
        const { dataRows, warnings } = this.splitData(rows, map, 5);
        const parsed: SkapDetailRow[] = [];
        let badDates = 0;
        for (const row of dataRows) {
            const startedAt = parseSkapRuDateTime(
                pickCell(row, map, 'startedAt'),
            );
            if (!startedAt) {
                badDates += 1;
                continue;
            }
            parsed.push({
                regList: pickCell(row, map, 'regList'),
                rpName: pickCell(row, map, 'rpName'),
                clientCard: pickCell(row, map, 'clientCard'),
                clientName: pickCell(row, map, 'clientName'),
                complectArmId: pickCell(row, map, 'complectArmId'),
                complectType: pickCell(row, map, 'complectType'),
                netCoef: pickCell(row, map, 'netCoef'),
                login: pickCell(row, map, 'login'),
                loginCreated: parseSkapRuDateTime(
                    pickCell(row, map, 'loginCreated'),
                ),
                startedAt,
                endedAt: parseSkapRuDateTime(pickCell(row, map, 'endedAt')),
                durationMs: parseSkapTimedeltaToMs(
                    pickCell(row, map, 'durationMs'),
                ),
                ip: pickCell(row, map, 'ip'),
            });
        }
        if (badDates) {
            warnings.push({
                code: 'rows_skipped',
                message: `Online_detail: ${badDates} строк без валидной даты захода пропущено`,
            });
        }
        return {
            formatVersion: SKAP_FORMAT_VERSIONS.online_detail,
            rows: parsed.filter(row => row.clientCard && row.login),
            warnings,
        };
    }

    private parsePrimeLent(rows: string[][]) {
        const map = buildSkapHeaderMap(
            'prime_lent',
            rows[0],
            SKAP_PRIME_LENT_COLUMNS_V1,
            SKAP_PRIME_LENT_REQUIRED_V1,
        );
        const { dataRows, warnings } = this.splitData(rows, map, 4);
        const parsed: SkapPrimeLentRow[] = dataRows.map(row => ({
            regList: pickCell(row, map, 'regList'),
            rpName: pickCell(row, map, 'rpName'),
            city: pickCell(row, map, 'city'),
            region: pickCell(row, map, 'region'),
            clientCard: pickCell(row, map, 'clientCard'),
            clientName: pickCell(row, map, 'clientName'),
            complectArmId: pickCell(row, map, 'complectArmId'),
            supplyKind: pickCell(row, map, 'supplyKind'),
            complectName: pickCell(row, map, 'complectName'),
            netCoef: pickCell(row, map, 'netCoef'),
            version: pickCell(row, map, 'version'),
            content: pickCell(row, map, 'content'),
            managerName: pickCell(row, map, 'managerName'),
            managerEmail: pickCell(row, map, 'managerEmail'),
            mailingName: pickCell(row, map, 'mailingName'),
            mailingEmail: pickCell(row, map, 'mailingEmail'),
            isActive:
                pickCell(row, map, 'isActive').trim().toLowerCase() ===
                SKAP_PRIME_LENT_ACTIVE_VALUE,
        }));
        return {
            formatVersion: SKAP_FORMAT_VERSIONS.prime_lent,
            rows: parsed.filter(row => row.clientCard && row.complectArmId),
            warnings,
        };
    }

    /**
     * Данные без строки заголовка + отсев коротких/битых строк
     * (меньше minCells непустых ячеек).
     */
    private splitData<TKey extends string>(
        rows: string[][],
        map: SkapHeaderMap<TKey>,
        minCells: number,
    ): { dataRows: string[][]; warnings: SkapFormatWarning[] } {
        const dataRows = (map.hasHeader ? rows.slice(1) : rows).filter(
            row => row.filter(cell => cell.length > 0).length >= minCells,
        );
        return { dataRows, warnings: [...map.warnings] };
    }
}
