import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticketId: number;

  @Column()
  originalName: string;

  // UUID-based filename stored on disk under the uploads directory.
  @Column()
  storedName: string;

  @Column()
  mimeType: string;

  @Column('bigint')
  size: number;

  @Column({ nullable: true })
  uploadedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
