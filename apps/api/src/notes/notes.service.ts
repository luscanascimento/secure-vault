import { Injectable, NotFoundException } from '@nestjs/common';
import { NotesRepository } from './notes.repository';
import { EncryptionService } from '../crypto/encryption.service';
import type { CreateNoteDto } from './dto/create-note.dto';
import type { UpdateNoteDto } from './dto/update-note.dto';
import type { QueryNotesDto } from './dto/query-notes.dto';
import type { Note as NoteRecord } from '../generated/prisma/client';
import type { Note as NoteDto } from '@secure-vault/shared-types';

/**
 * Business logic for notes. Encrypts the note body before it reaches the DB and
 * decrypts it on read, so the database never holds a readable body — the server
 * itself does hold the key, and titles/tags are stored in plaintext. Ownership
 * is enforced by the repository (all queries scoped by userId).
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly repo: NotesRepository,
    private readonly encryption: EncryptionService,
  ) {}

  async create(userId: string, dto: CreateNoteDto): Promise<NoteDto> {
    const enc = this.encryption.encrypt(dto.content);
    const record = await this.repo.create(userId, {
      title: dto.title,
      contentIv: enc.iv,
      contentTag: enc.tag,
      content: enc.ciphertext,
      tags: dto.tags ?? [],
    });
    return this.decryptToDto(record);
  }

  async findAll(userId: string, query: QueryNotesDto): Promise<NoteDto[]> {
    const records = await this.repo.findManyForUser(userId, query.tag);
    const decrypted = records.map((record) => this.decryptToDto(record));

    if (!query.search) {
      return decrypted;
    }

    // Search must run on plaintext, so it is applied after decryption
    // (content is opaque ciphertext in the DB and cannot be queried directly).
    const needle = query.search.toLowerCase();
    return decrypted.filter(
      (note) =>
        note.title.toLowerCase().includes(needle) ||
        note.content.toLowerCase().includes(needle) ||
        note.tags.some((tag) => tag.includes(needle)),
    );
  }

  async findOne(userId: string, id: string): Promise<NoteDto> {
    const record = await this.repo.findOneForUser(userId, id);
    if (!record) {
      throw new NotFoundException('Note not found.');
    }
    return this.decryptToDto(record);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateNoteDto,
  ): Promise<NoteDto> {
    // Ensure the note exists and belongs to the user first.
    await this.findOne(userId, id);

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      data.title = dto.title;
    }
    if (dto.tags !== undefined) {
      data.tags = dto.tags;
    }
    if (dto.content !== undefined) {
      const enc = this.encryption.encrypt(dto.content);
      data.contentIv = enc.iv;
      data.contentTag = enc.tag;
      data.content = enc.ciphertext;
    }

    await this.repo.update(userId, id, data);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.repo.delete(userId, id);
    if (result.count === 0) {
      throw new NotFoundException('Note not found.');
    }
  }

  private decryptToDto(record: NoteRecord): NoteDto {
    const content = this.encryption.decrypt({
      iv: record.contentIv,
      tag: record.contentTag,
      ciphertext: record.content,
    });
    return {
      id: record.id,
      title: record.title,
      content,
      tags: record.tags,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
