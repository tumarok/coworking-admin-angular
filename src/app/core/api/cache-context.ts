import { HttpContextToken } from '@angular/common/http';
import type { Tag } from './tags';

/** The tags a GET shows. The cache entry is current only while none of them was invalidated. */
export const CACHE_TAGS = new HttpContextToken<readonly Tag[]>(() => []);

/** Skips the cache lookup and replaces the stored response with the fresh one. */
export const BYPASS_CACHE = new HttpContextToken<boolean>(() => false);
