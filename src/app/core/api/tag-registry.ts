import { Injectable, signal } from '@angular/core';
import { ANY_ID, type Tag, tagKey } from './tags';

interface Versions {
  readonly byTag: Readonly<Record<string, number>>;
  readonly byType: Readonly<Record<string, number>>;
}

/**
 * Counts how many times each tag was invalidated. Nothing is stored per query: a query remembers
 * the counts it was loaded under and loads again when they change, so only the queries that show
 * an invalidated tag react, and every cached response made under older counts is out of date.
 */
@Injectable({ providedIn: 'root' })
export class TagRegistry {
  private readonly versions = signal<Versions>({ byTag: {}, byType: {} });

  /** Reading it inside a `computed` makes the computed depend on invalidations of that tag. */
  version(tag: Tag): number {
    const { byTag, byType } = this.versions();
    return (byTag[tagKey(tag)] ?? 0) + (byType[tag.type] ?? 0);
  }

  versionsOf(tags: readonly Tag[]): number[] {
    return tags.map((tag) => this.version(tag));
  }

  /** One batch is one change, however many tags it lists, so a query shows up once, not per tag. */
  invalidate(tags: readonly Tag[]): void {
    if (tags.length === 0) return;
    this.versions.update(({ byTag, byType }) => {
      const nextByTag = { ...byTag };
      const nextByType = { ...byType };
      for (const tag of tags) {
        if (tag.id === ANY_ID) {
          nextByType[tag.type] = (nextByType[tag.type] ?? 0) + 1;
        } else {
          const key = tagKey(tag);
          nextByTag[key] = (nextByTag[key] ?? 0) + 1;
        }
      }
      return { byTag: nextByTag, byType: nextByType };
    });
  }
}
