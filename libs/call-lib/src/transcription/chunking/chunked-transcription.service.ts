import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { ChunkProgressStore, type DoneChunk } from './chunk-progress.store';
import { runChunkPool } from './chunk-pool.util';
import {
    chunkFileName,
    chunkSummaryLine,
    countProviders,
    providerSeconds,
} from './chunk-report.util';
import { stitchChunkTranscripts } from './chunk-stitch.util';
import { ChunkTranscriptionError } from './chunk-transcription.error';
import type {
    ChunkedTranscriptionResult,
    TranscribeChunkedInput,
} from './chunked-transcription.types';
import { splitMp3, type Mp3Chunk } from './mp3-split.util';

/** Распознанный кусок вместе с его границами в записи. */
type RecognizedPart = DoneChunk & Pick<Mp3Chunk, 'startSec' | 'endSec'>;

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Распознавание длинного звонка кусками (19.11.2026: длинные звонки целиком
 * уходили в платный Яндекс — бесплатные распознаватели не укладывались в
 * срок ответа на час записи).
 *
 * Запись режется по кадрам MP3 (mp3-split.util), куски распознаются не
 * больше `parallel` одновременно; каждый кусок — по списку распознавателей
 * по очереди, пока кто-то не справится. Не справился никто — ошибка звонка
 * с номером куска, новые куски не начинаются. Готовые куски сразу ложатся
 * в Redis (chunk-progress.store): повторный запуск звонка распознаёт только
 * оставшиеся — в том числе не платит Яндексу второй раз за его куски.
 * Склейка — chunk-stitch.util, после неё прогресс удаляется.
 *
 * Кто распознаёт куски, решает вызывающий (маршрутизатор): сервис не знает
 * ни провайдеров, ни Битрикса, в `this` — только Redis.
 */
@Injectable()
export class ChunkedTranscriptionService {
    private readonly logger = new Logger(ChunkedTranscriptionService.name);

    constructor(@Optional() private readonly redis?: RedisService) {}

    /** null — запись не MP3 (или битая): резать нельзя, распознавать целиком. */
    async transcribeChunked(
        input: TranscribeChunkedInput,
    ): Promise<ChunkedTranscriptionResult | null> {
        if (input.attempts.length === 0) {
            throw new Error(
                `Звонок ${input.callKey}: не задано ни одного распознавателя кусков`,
            );
        }
        const chunks = splitMp3(input.audio, {
            chunkSec: input.chunkSec,
            overlapSec: input.overlapSec,
        });
        if (!chunks) {
            this.logger.warn(
                `Звонок ${input.callKey}: запись ${input.fileName} не разобрана как MP3 — резать нельзя, распознаём целиком`,
            );
            return null;
        }

        const startedAt = Date.now();
        const progress = new ChunkProgressStore(
            this.redis,
            input.callKey,
            this.logger,
        );
        const ready = await progress.load({
            chunkSec: input.chunkSec,
            overlapSec: input.overlapSec,
            chunks: chunks.length,
            bytes: input.audio.length,
        });
        this.logger.log(
            `Звонок ${input.callKey}: ${chunks.length} кусков по ${input.chunkSec} с ` +
                `(нахлёст ${input.overlapSec} с, одновременно ${input.parallel}), ` +
                `готовых из прошлого запуска ${ready.size}`,
        );

        const parts = await runChunkPool(
            chunks.length,
            input.parallel,
            async (index): Promise<RecognizedPart> => {
                const chunk = chunks[index];
                const done =
                    ready.get(index) ??
                    (await this.recognize(
                        chunk,
                        chunks.length,
                        input,
                        progress,
                    ));
                return {
                    ...done,
                    startSec: chunk.startSec,
                    endSec: chunk.endSec,
                };
            },
        );

        const stitched = stitchChunkTranscripts(parts);
        await progress.clear();
        const providers = countProviders(parts);
        this.logger.log(
            chunkSummaryLine({
                callKey: input.callKey,
                chunks: chunks.length,
                chunkSec: input.chunkSec,
                providers,
                elapsedMs: Date.now() - startedAt,
                reused: ready.size,
                untimed: stitched.untimed,
            }),
        );
        return {
            text: stitched.text,
            segments: stitched.segments,
            chunks: chunks.length,
            providers,
            providerSeconds: providerSeconds(parts),
            untimed: stitched.untimed,
        };
    }

    /** Кусок — распознавателям по очереди; первый успех сохраняется в прогресс. */
    private async recognize(
        chunk: Mp3Chunk,
        count: number,
        input: TranscribeChunkedInput,
        progress: ChunkProgressStore,
    ): Promise<DoneChunk> {
        const fileName = chunkFileName(input.fileName, chunk.index, count);
        const info = {
            index: chunk.index,
            count,
            startSec: chunk.startSec,
            endSec: chunk.endSec,
        };
        const errors: string[] = [];
        for (const [position, attempt] of input.attempts.entries()) {
            try {
                const recognized = await attempt.transcribe(
                    chunk.buffer,
                    fileName,
                    info,
                );
                const done: DoneChunk = {
                    provider: attempt.provider,
                    text: recognized.text,
                    segments: recognized.segments,
                };
                await progress.saveDone(chunk.index, done);
                return done;
            } catch (error) {
                errors.push(`${attempt.provider}: ${errorText(error)}`);
                const next = input.attempts[position + 1];
                this.logger.warn(
                    `Звонок ${input.callKey}, кусок ${chunk.index + 1} из ${count}: ` +
                        `${attempt.provider} не справился (${errorText(error)})` +
                        (next ? ` — пробуем ${next.provider}` : ''),
                );
            }
        }
        await progress.saveFailed(chunk.index, errors);
        throw new ChunkTranscriptionError(
            input.callKey,
            chunk.index,
            count,
            errors,
            chunk.startSec,
            chunk.endSec,
        );
    }
}
