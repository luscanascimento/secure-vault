import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Note creation payload. Validated & whitelisted by the global ValidationPipe.
 * Tags are trimmed, lower-cased and de-duplicated for consistency.
 */
export class CreateNoteDto {
  @IsString()
  @MinLength(1, { message: 'Title is required.' })
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(50_000)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .map((tag: unknown) => String(tag).trim().toLowerCase())
              .filter((tag: string) => tag.length > 0),
          ),
        )
      : value,
  )
  tags?: string[];
}
