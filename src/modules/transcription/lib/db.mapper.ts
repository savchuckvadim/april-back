import { Transcription } from "generated/prisma";
import { TranscriptionStoreDto } from "../dto/transcription.store.dto";

export function createTranscriptionResponseDtoFromPrisma(transcription: Transcription): TranscriptionStoreDto {
    return {
        id: transcription.id.toString(),
        created_at: transcription.created_at ?? undefined,
        updated_at: transcription.updated_at ?? undefined,
        provider: transcription.provider ?? undefined,
        activityId: transcription.activity_id ?? undefined,
        fileId: transcription.file_id ?? undefined,
        inComment: transcription.in_comment,
        status: transcription.status,
        text: transcription.text ?? '',
        symbolsCount: transcription.symbols_count ?? '',
        price: transcription.price ?? '',
        duration: transcription.duration ?? '',
        domain: transcription.domain ?? '',
        userResult: transcription.user_result ?? undefined,
        userId: transcription.user_id ?? undefined,
        userName: transcription.user_name ?? undefined,
        taskId: transcription.id.toString(),
    } as TranscriptionStoreDto;
}


// export function createTranscriptionEntityFromEntity(transcription: TranscriptionEntity): Transcription {
//     return {
//         id: BigInt(transcription.id),
//         created_at: transcription.created_at ?? undefined,
//         updated_at: transcription.updated_at ?? undefined,
//         provider: transcription.provider ?? undefined,
//         activity_id: transcription.activity_id ?? undefined,
//         file_id: transcription.file_id ?? undefined,
//         in_comment: transcription.in_comment ?? false,
//         status: transcription.status ?? undefined,
//         text: transcription.text ?? '',
//         symbols_count: transcription.symbols_count ?? '',
//         price: transcription.price ?? '',
//         duration: transcription.duration ?? '',
//         domain: transcription.domain ?? '',
//         user_result: transcription.user_result ?? undefined,
//     } as Transcription;
// }
