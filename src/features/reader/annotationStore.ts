// NOTES + HIGHLIGHTS PHASE: the reader engine's own narrow view of
// annotations for ONE open Edition -- deliberately separate from
// ProgressStore (position/Fragment/Bookmark). ProgressStore's own header
// comment already predicted account-backed Fragments would need this kind
// of change some day; this phase makes the opposite call on purpose (see
// supabaseProgressStore.ts's own comment) -- Fragment/localStorage stays
// completely untouched for guests, and this is a new, parallel, richer,
// authenticated-only mechanism instead of a retrofit of the old one.
// readerEngine.ts only ever talks to this interface, never to
// src/api/annotations.ts directly, and never to Supabase at all when it's
// null (the guest / no-workId case -- see ReaderView.tsx's own comment on
// when that happens).
import type { Annotation, CreateAnnotationInput as ApiCreateAnnotationInput } from "../../api/annotations";
import {
  listAnnotationsForEdition,
  createAnnotation,
  updateAnnotationNote,
  deleteAnnotation
} from "../../api/annotations";

export type { Annotation };

export interface CreateAnnotationInput {
  // CLIENT UUID: caller-generated (see src/api/annotations.ts's own
  // CreateAnnotationInput.id comment) -- passed straight through to the
  // API layer below, unchanged.
  id: string;
  quoteText: string;
  pageIndex: number;
  startOffset: number;
  endOffset: number;
  contextBefore: string | null;
  contextAfter: string | null;
}

export interface AnnotationStore {
  list(): Promise<Annotation[]>;
  create(input: CreateAnnotationInput): Promise<Annotation>;
  updateNote(id: string, noteText: string | null): Promise<Annotation>;
  remove(id: string): Promise<void>;
}

export function createSupabaseAnnotationStore(userId: string, workId: string, editionId: string): AnnotationStore {

  return {

    list: () => listAnnotationsForEdition(editionId),

    create: (input: CreateAnnotationInput) => {
      const fullInput: ApiCreateAnnotationInput = { userId, workId, editionId, ...input };
      return createAnnotation(fullInput);
    },

    updateNote: (id: string, noteText: string | null) => updateAnnotationNote(id, noteText),

    remove: (id: string) => deleteAnnotation(id)

  };

}
