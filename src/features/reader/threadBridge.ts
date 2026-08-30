// READER -> THOUGHT THREAD BRIDGE v1: the reader engine's own narrow view of
// Thought Threads, mirroring annotationStore.ts's own pattern (a plain
// interface readerEngine.ts talks to, never Supabase/RLS/SQL details
// directly, and never at all when this is null -- see ReaderView.tsx's own
// comment on when that happens). This is a bridge, not a new Atlas feature:
// it exists only so a freshly confirmed annotation can be added to one of
// the visitor's OWN EXISTING Thought Threads without leaving Reader.
//
// CORRECTION PASS: addAnnotation() now writes through
// appendAnnotationToThoughtThread() (src/api/thoughtThreads.ts), backed by
// the atomic, row-locked append_annotation_to_thought_thread RPC -- NOT
// the earlier "list -> append client-side -> replaceThoughtThread()" path.
// That earlier path had a genuine TOCTOU/lost-update window: it read the
// Thread's full annotationIds snapshot, then (after network round trips)
// wrote that entire snapshot back via replace_thought_thread, which
// deletes every existing item row and re-inserts whatever array it was
// given. Any OTHER write landing in the read-to-write gap -- another
// tab's own append, or a metadata edit from the Atlas Thread editor --
// would be silently discarded the moment this write landed, because the
// snapshot it was built from never saw it. Fresh-fetch-immediately-before-
// write shrank that window but could not close it; only a single atomic
// server-side transaction can (see the RPC's own SQL for the full proof).
// replaceThoughtThread() remains unused here and untouched in
// src/api/thoughtThreads.ts -- it is still the correct call for the real
// Thread editor's full metadata + membership + reordering edits.
import type { ThoughtThread } from "../../api/thoughtThreads";
import {
  listThoughtThreads,
  appendAnnotationToThoughtThread,
  ThoughtThreadAppendError,
  ThoughtThreadLoadError
} from "../../api/thoughtThreads";

export type { ThoughtThread };

// MERGE-GATE CORRECTION: this string is no longer the PRIMARY way list()
// recognizes a session-expired failure -- listThoughtThreads() now throws
// a typed ThoughtThreadLoadError with kind "not_authenticated" for both
// the local no-session case and a PostgREST-level pre-query JWT rejection
// (see classifyLoadError below), matching how addAnnotation() already
// classifies appendAnnotationToThoughtThread() via ThoughtThreadAppendError.kind.
// This literal is kept only as a defense-in-depth fallback for any other
// caller shape that might still surface the bare message (annotations.ts
// uses the identical literal for its own, unrelated authContext() calls).
const NOT_AUTHENTICATED_MESSAGE = "Не авторизован.";

export class ThoughtThreadSessionExpiredError extends Error {
  constructor() {
    super(NOT_AUTHENTICATED_MESSAGE);
    this.name = "ThoughtThreadSessionExpiredError";
  }
}

// The Thread the visitor picked no longer exists (deleted, or -- in
// principle -- ownership changed) by the time the append RPC actually
// ran server-side. Never resurrect it; the caller shows an explicit
// "Эта нить больше недоступна." state instead.
export class ThoughtThreadNotFoundError extends Error {
  constructor() {
    super("Thought Thread not found or no longer available.");
    this.name = "ThoughtThreadNotFoundError";
  }
}

// The annotation itself is no longer available to this visitor (deleted,
// or ownership somehow no longer matches) by the time the append RPC ran
// server-side. Distinct from ThoughtThreadNotFoundError -- the Thread is
// fine, the fragment is the problem.
export class ThoughtThreadAnnotationUnavailableError extends Error {
  constructor() {
    super("Annotation not found or no longer available.");
    this.name = "ThoughtThreadAnnotationUnavailableError";
  }
}

// MERGE-GATE CORRECTION: classifies listThoughtThreads()'s own typed
// ThoughtThreadLoadError -- the symmetric counterpart to
// classifyAppendError() below. Checks the typed kind FIRST (the primary,
// new mechanism); the bare message-string comparison only runs as a
// defense-in-depth fallback for a shape this bridge cannot otherwise
// recognize, never as the main path for the new PostgREST-pre-query-JWT
// case this correction pass adds.
function classifyLoadError(error: unknown): Error {
  if (error instanceof ThoughtThreadLoadError) {
    return error.kind === "not_authenticated" ? new ThoughtThreadSessionExpiredError() : error;
  }
  if (error instanceof Error && error.message === NOT_AUTHENTICATED_MESSAGE) {
    return new ThoughtThreadSessionExpiredError();
  }
  return error instanceof Error ? error : new Error(String(error));
}

// Maps appendAnnotationToThoughtThread()'s own stable error kind onto
// this bridge's typed errors -- the one place that translation happens,
// so readerEngine.ts's picker code only ever needs to check against
// these three classes (plus "anything else" = generic failure) and never
// needs to know about ThoughtThreadAppendError or SQLSTATEs at all.
function classifyAppendError(error: unknown): Error {
  if (error instanceof ThoughtThreadAppendError) {
    switch (error.kind) {
      case "not_authenticated":
        return new ThoughtThreadSessionExpiredError();
      case "thread_unavailable":
        return new ThoughtThreadNotFoundError();
      case "annotation_unavailable":
        return new ThoughtThreadAnnotationUnavailableError();
      case "generic":
        return error;
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

export interface ThoughtThreadBridge {
  // On-demand only -- readerEngine.ts calls this the first time the
  // visitor opens the picker for a given Reader session, never on every
  // Reader open (see readerEngine.ts's own threadListCache comment).
  list(): Promise<ThoughtThread[]>;

  // Adds ONE annotation to ONE existing Thread, atomically, via
  // appendAnnotationToThoughtThread() -- never creates a Thread (v1 only
  // supports adding to an existing one) and never sends back
  // title/question/synthesisNote/other items, so it cannot ever
  // overwrite a concurrent edit to any of those.
  //
  // TRUE SUCCESS SEMANTICS: this resolves the instant the server-side
  // append itself is confirmed. It then makes ONE best-effort attempt to
  // refresh the full Thread list for the picker's own display -- if that
  // refresh fails, this still RESOLVES (never rejects) with `null`, not
  // an error. A caller must never treat `null` as a failure: the append
  // already happened; only the follow-up read of it did not. This is
  // what a caller uses to update the picker's list DISPLAY -- it is not
  // how the caller learns whether the write succeeded (a thrown error is
  // the only failure signal; see readerEngine.ts's own handleAddToThread
  // for how it falls back to a deterministic local membership update
  // when this is null).
  addAnnotation(threadId: string, annotationId: string): Promise<ThoughtThread[] | null>;
}

export function createSupabaseThoughtThreadBridge(): ThoughtThreadBridge {
  return {

    list: async () => {
      try {
        return await listThoughtThreads();
      } catch (error) {
        throw classifyLoadError(error);
      }
    },

    addAnnotation: async (threadId: string, annotationId: string) => {

      try {
        await appendAnnotationToThoughtThread(threadId, annotationId);
      } catch (error) {
        throw classifyAppendError(error);
      }

      // From here on the append is CONFIRMED -- a failure below must
      // never surface as a write failure to the caller (see this
      // function's own TRUE SUCCESS SEMANTICS doc comment above).
      try {
        return await listThoughtThreads();
      } catch (refreshError) {
        console.error(
          "Thought Thread list refresh failed after a CONFIRMED append (the append itself succeeded):",
          refreshError
        );
        return null;
      }

    }

  };
}
