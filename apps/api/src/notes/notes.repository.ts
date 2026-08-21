import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Note, Prisma } from '../generated/prisma/client';

/**
 * Data-access layer for notes. Every method is scoped by `userId` so a user can
 * only ever touch their own rows. All queries are parameterized by Prisma —
 * no string-concatenated SQL — which eliminates SQL-injection risk.
 */
@Injectable()
export class NotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    data: {
      title: string;
      contentIv: string;
      contentTag: string;
      content: string;
      tags: string[];
    },
  ): Promise<Note> {
    return this.prisma.note.create({ data: { ...data, userId } });
  }

  findManyForUser(userId: string, tag?: string): Promise<Note[]> {
    const where: Prisma.NoteWhereInput = { userId };
    if (tag) {
      where.tags = { has: tag };
    }
    return this.prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  findOneForUser(userId: string, id: string): Promise<Note | null> {
    return this.prisma.note.findFirst({ where: { id, userId } });
  }

  update(
    userId: string,
    id: string,
    data: Prisma.NoteUpdateInput,
  ): Promise<Prisma.BatchPayload> {
    // updateMany with the userId in the filter guarantees ownership.
    return this.prisma.note.updateMany({ where: { id, userId }, data });
  }

  delete(userId: string, id: string): Promise<Prisma.BatchPayload> {
    return this.prisma.note.deleteMany({ where: { id, userId } });
  }
}
