import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Registration payload. Validated & sanitized by the global ValidationPipe
 * (whitelist + forbidNonWhitelisted), so unknown properties are rejected.
 */
export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters.' })
  @MaxLength(128)
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter.' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter.' })
  @Matches(/[0-9]/, { message: 'Password must contain a number.' })
  @Matches(/[^A-Za-z0-9]/, {
    message: 'Password must contain a special character.',
  })
  password!: string;
}
