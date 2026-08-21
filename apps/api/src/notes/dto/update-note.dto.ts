import { PartialType } from '@nestjs/mapped-types';
import { CreateNoteDto } from './create-note.dto';

/** All fields optional — same validation rules as creation when present. */
export class UpdateNoteDto extends PartialType(CreateNoteDto) {}
