import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { Project } from '../projects/project.entity';
import { User } from '../users/user.entity';

export enum TicketStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum TicketType {
  BUG = 'BUG',
  FEATURE = 'FEATURE',
  TECHNICAL = 'TECHNICAL',
}

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.TODO })
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketPriority })
  priority: TicketPriority;

  @Column({ type: 'enum', enum: TicketType })
  type: TicketType;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  @Column()
  projectId: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  assignee: User | null;

  @Column({ nullable: true })
  assigneeId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({ default: false })
  isOverdue: boolean;

  // Incremented by TypeORM on every save; used to detect concurrent edits
  // (UPDATE ... WHERE id = ? AND version = ? → 0 rows → conflict error).
  @VersionColumn()
  version: number;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
