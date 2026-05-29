import { Exclude } from 'class-transformer';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  // Hidden from query results by default, and stripped from any serialized
  // response by ClassSerializerInterceptor even when explicitly selected.
  @Exclude()
  @Column({ select: false })
  password: string;
}
