import { Transform } from 'class-transformer';
import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  owner: User;

  @Column()
  ownerId: number;

  @Transform(({ value, options }) => options?.groups?.includes('admin') ? value : undefined)
  @DeleteDateColumn()
  deletedAt: Date | null;
}
