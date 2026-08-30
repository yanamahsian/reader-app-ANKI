// READER -> THOUGHT THREAD BRIDGE v1: the reader engine's own narrow view of
// Thought Threads, mirroring annotationStore.ts's own pattern (a plain
// interface readerEngine.ts talks to, never Supabase/RLS/SQL details
// directly, and never at all when this is null -- see ReaderView.tsx's own
// comment on when that happens). This is a bridge, not a new Atlas feature:
// it exists only so a freshly confirmed annotation can be added to one of
// the visitor's OWN EXISTING Thought Threads without leaving Reader.
//
// Deliberately reuses the existing safe write path (replaceThoughtThread(),
// src/api/thoughtThreads.ts) rather than the lower-level
// addAnnotationToThoughtThread() row insert: replaceThoughtThread's RPC is
// what already advances thought_threads.updated_at and is already proven
// (by create_thought_thread/replace_thought_thread's own SQL) to verify
// thread + annotation ownership atomically. The raw item INSERT does
// neither -- it defaults position to 0 (which would make a newly added
// fragment the FIRST item, not the last) and never touches updated_at at
// all, so it is not used here.
import type { ThoughtThread, ThoughtThreadInput } from "../../api/thoughtThreads";
import { listThoughtThreads, replaceThoughtThread } from "../../api/thoughtThreads";

export type { ThoughtThread };

// Mirrors the exact string src/api/thoughtThreads.ts's own authContext()
// throws when there is no session or the access token could not be
// refreshed (annotations.ts uses the identical literal for the same
// purpose) -- this lets the bridge distinguish "session expired" from an
// ordinary network/write failure without exporting a new error class from
// thoughtThreads.ts or touching that file at all.
const NOT_AUTHENTICATED_MESSAGE = "Не авторизован.";

export class ThoughtThreadSessionExpiredError extends Error {
  constructor() {
    super(NOT_AUTHENTICATED_MESSAGE);
    this.name = "ThoughtThreadSessionExpiredError";
  }
}

// The race described in the spec: the picker was opened, the visitor
// picked a Thread, and by the time of the fresh pre-write fetch that
// Thread no longer exists (deleted, or -- extremely unlikely but not
// impossible -- this visitor's own ownership of it changed) in another
// tab/session. Never resurrect it; the caller shows an explicit
// "Эта нить больше недоступна." state instead.
export class ThoughtThreadNotFoundError extends Error {
  constructor() {
    super("Thought Thread not found or no longer available.");
    this.name = "ThoughtThreadNotFoundError";
  }
}

function rethrowTyped(error: unknown): never {
  if (error instanceof Error && error.message === NOT_AUTHENTICATED_MESSAGE) {
    throw new ThoughtThreadSessionExpiredError();
  }
  throw error;
}

export interface ThoughtThreadBridge {
  // On-demand only -- readerEngine.ts calls this the first time the
  // visitor opens the picker for a given Reader session, never on every
  // Reader open (see readerEngine.ts's own threadListCache comment).
  list(): Promise<ThoughtThread[]>;

  // Adds ONE annotation to ONE existing Thread and returns the resulting
  // fresh Thread list (so the caller can update picker/membership state
  // without a second round trip). Never creates a Thread -- v1 only
  // supports adding to an existing one (see spec's own "existing threads
  // only" requirement; createThoughtThread() requires >=2 annotations and
  // is out of scope for a single freshly-saved fragment).
  //
  // Always re-fetches Thread state immediately before writing (this is
  // the entire anti-stale-overwrite guarantee): the Thread's CURRENT
  // title/question/synthesisNote/annotationIds are read fresh, the new
  // annotation id is appended (deduplicated, at the END, preserving
  // existing order) and only THAT snapshot is written back via
  // replaceThoughtThread() -- never a snapshot cached from an earlier
  // list() call, which could already be missing another tab's edit.
  addAnnotation(threadId: string, annotationId: string): Promise<ThoughtThread[]>;
}

export function createSupabaseThoughtThreadBridge(): ThoughtThreadBridge {
  return {

    list: async () => {
      try {
        return await listThoughtThreads();
      } catch (error) {
        rethrowTyped(error);
      }
    },

    addAnnotation: async (threadId: string, annotationId: string) => {
      let fresh: ThoughtThread[];
      try {
        fresh = await listThoughtThreads();
      } catch (error) {
        rethrowTyped(error);
      }

      const thread = fresh.find(candidate => candidate.id === threadId);
      if (!thread) {
        throw new ThoughtThreadNotFoundError();
      }

      // Already a member (e.g. added from another tab between the picker
      // opening and this click): idempotent no-op, no second write, no
      // duplicate item -- the caller is expected to already prevent this
      // click via the same membership check, this is defense in depth.
      if (thread.annotationIds.includes(annotationId)) {
        return fresh;
      }

      const input: ThoughtThreadInput = {
        title: thread.title,
        question: thread.question,
        synthesisNote: thread.synthesisNote,
        // Append at the END, preserving every existing item's order --
        // replace_thought_thread's own SQL assigns position by array
        // ordinality, so the new id lands last, never position 0.
        annotationIds: [...thread.annotationIds, annotationId]
      };

      try {
        await replaceThoughtThread(threadId, input);
        return await listThoughtThreads();
      } catch (error) {
        rethrowTyped(error);
      }
    }

  };
}
