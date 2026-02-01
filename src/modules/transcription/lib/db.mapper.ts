import { Transcription } from "generated/prisma";
import { TranscriptionBaseDto, TranscriptionStoreDto } from "../dto/transcription.store.dto";

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
        app: transcription.app ?? undefined,
        entityType: transcription.entity_type ?? undefined,
        entityId: transcription.entity_id ?? undefined,
        entityName: transcription.entity_name ?? undefined,
        department: transcription.department ?? undefined,
    } as TranscriptionStoreDto;
}


export function createTranscriptionEntityFromDto(transcription: Partial<TranscriptionBaseDto>): Partial<Transcription> {
    const data = {


        user_result: transcription.userResult ? JSON.parse(transcription.userResult as string) : null,
    } as Transcription;

    if (transcription.entityId) {
        data.entity_id = transcription.entityId;
    }
    if (transcription.userResult) {
        data.user_result = JSON.parse(transcription.userResult as string);
    }
    if (transcription.entityName) {
        data.entity_name = transcription.entityName;
    }
    if (transcription.department) {
        data.department = transcription.department;
    }
    if (transcription.app) {
        data.app = transcription.app;
    }
    if (transcription.userId) {
        data.user_id = transcription.userId;
    }
    if (transcription.userName) {
        data.user_name = transcription.userName;
    }
    if (transcription.activityId) {
        data.activity_id = transcription.activityId;
    }
    if (transcription.fileId) {
        data.file_id = transcription.fileId;
    }
    if (transcription.inComment) {
        data.in_comment = transcription.inComment;
    }
    if (transcription.status) {
        data.status = transcription.status;
    }
    if (transcription.text) {
        data.text = transcription.text;
    }
    if (transcription.symbolsCount) {
        data.symbols_count = transcription.symbolsCount;
    }
    if (transcription.price) {
        data.price = transcription.price;
    }
    if (transcription.duration) {
        data.duration = transcription.duration;
    }
    if (transcription.domain) {
        data.domain = transcription.domain;
    }
    if (transcription.provider) {
        data.provider = transcription.provider;
    }
    if (transcription.entityType) {
        data.entity_type = transcription.entityType;
    }
    if (transcription.entityName) {
        data.entity_name = transcription.entityName;
    }
    if (transcription.department) {
        data.department = transcription.department;
    }
    if (transcription.app) {
        data.app = transcription.app;
    }
    if (transcription.userId) {
        data.user_id = transcription.userId;
    }
    if (transcription.userName) {
        data.user_name = transcription.userName;
    }
    if (transcription.activityId) {
        data.activity_id = transcription.activityId;
    }
    if (transcription.fileId) {
        data.file_id = transcription.fileId;
    }
    if (transcription.inComment) {
        data.in_comment = transcription.inComment;
    }
    return data as Transcription;
}
