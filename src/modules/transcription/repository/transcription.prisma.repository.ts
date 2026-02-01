import { Injectable } from "@nestjs/common";
import { TranscriptionRepository } from "./transcription.repository";
import { PrismaService } from "@/core";
import { Transcription } from "generated/prisma";
import { TranscriptionBaseDto } from "../dto/transcription.store.dto";

@Injectable()
export class TranscriptionPrismaRepository implements TranscriptionRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(transcription: TranscriptionBaseDto): Promise<Transcription | null> {
        return this.prisma.transcription.create({
            data: {
                user_name: transcription.userName,
                app: transcription.app,
                activity_id: transcription.activityId,
                file_id: transcription.fileId,
                in_comment: transcription.inComment,
                status: transcription.status,
                text: transcription.text,
                symbols_count: transcription.symbolsCount,
                price: transcription.price,
                duration: transcription.duration,
                domain: transcription.domain,
                user_id: transcription.userId,
                entity_type: transcription.entityType,
                entity_id: transcription.entityId,
                entity_name: transcription.entityName,
                department: transcription.department,
                user_result: transcription.userResult ? JSON.parse(transcription.userResult as string) : null,
                provider: transcription.provider,
            },
        });
    }
    async update(id: string, transcription: Partial<Transcription>): Promise<Transcription | null> {
        return this.prisma.transcription.update({
            where: { id: BigInt(id) },
            data: {
                ...transcription,
                user_result: transcription.user_result ? JSON.parse(transcription.user_result as string) : null,
            },
        });
    }
    async findById(id: string): Promise<Transcription | null> {
        return this.prisma.transcription.findUnique({
            where: { id: BigInt(id) },
        });
    }
    async findMany(): Promise<Transcription[] | null> {
        return this.prisma.transcription.findMany();
    }
    async findByDomain(domain: string): Promise<Transcription[] | null> {
        return this.prisma.transcription.findMany({
            where: { domain },
        });
    }
    async findByDomainAndUser(domain: string, userId: string): Promise<Transcription[] | null> {
        return this.prisma.transcription.findMany({
            where: { domain, user_id: userId },
        });
    }
    async delete(id: string): Promise<boolean> {
        const result = await this.prisma.transcription.delete({
            where: { id: BigInt(id) },
        });
        return result !== null;
    }
}
