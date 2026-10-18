import { z } from 'zod';

import { idSchema, pageQuerySchema } from './common';

export const ROOM_TYPES = ['meeting_room', 'private_office', 'hot_desk', 'event_space'] as const;
export const ROOM_STATUSES = ['available', 'maintenance', 'retired'] as const;
export const AMENITIES = [
  'projector',
  'whiteboard',
  'video_conferencing',
  'phone',
  'standing_desks',
  'natural_light',
] as const;

export const roomTypeSchema = z.enum(ROOM_TYPES);
export const roomStatusSchema = z.enum(ROOM_STATUSES);
export const amenitySchema = z.enum(AMENITIES);

export const roomSchema = z.object({
  id: idSchema,
  locationId: idSchema,
  locationName: z.string(),
  name: z.string(),
  type: roomTypeSchema,
  capacity: z.number().int().min(1),
  /** Price per hour in cents. */
  hourlyRate: z.number().int().min(0),
  amenities: z.array(amenitySchema),
  status: roomStatusSchema,
});

export const roomInputSchema = z.object({
  locationId: idSchema.describe('Location'),
  name: z.string().trim().min(2, { error: 'At least 2 characters' }).max(60),
  type: roomTypeSchema,
  capacity: z.number().int().min(1, { error: 'At least 1 seat' }).max(200),
  hourlyRate: z.number().int().min(0, { error: 'Cannot be negative' }).max(1_000_000),
  amenities: z.array(amenitySchema),
  status: roomStatusSchema,
});

export const roomListQuerySchema = pageQuerySchema.extend({
  locationId: idSchema.optional(),
  type: roomTypeSchema.optional(),
  status: roomStatusSchema.optional(),
  minCapacity: z.coerce.number().int().min(1).optional(),
});

export type Room = z.infer<typeof roomSchema>;
export type RoomInput = z.infer<typeof roomInputSchema>;
export type RoomType = z.infer<typeof roomTypeSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type Amenity = z.infer<typeof amenitySchema>;
export type RoomListQuery = z.input<typeof roomListQuerySchema>;
