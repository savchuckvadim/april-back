import { Injectable } from "@nestjs/common";
import { TranscriptionRepository } from "./transcription.repository";
import { PrismaService } from "@/core";
import { Transcription } from "generated/prisma";

@Injectable()
export class TranscriptionPrismaRepository implements TranscriptionRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(transcription: Partial<Transcription>): Promise<Transcription | null> {
        return this.prisma.transcription.create({
            data: {
                ...transcription,
                user_result: transcription.user_result ? JSON.parse(transcription.user_result as string) : null,
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
