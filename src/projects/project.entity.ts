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

  // Populated on soft-delete; TypeORM automatically excludes rows where
  // deletedAt IS NOT NULL from all find* queries.
  @DeleteDateColumn()
  deletedAt: Date | null;
}
