CREATE TABLE "highlights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid REFERENCES "conversations"("id"),
  "participant_id" text REFERENCES "participants"("id"),
  "message_index" integer NOT NULL,
  "selected_text" text NOT NULL,
  "reaction" text,
  "comment" text,
  "created_at" timestamp DEFAULT now()
);
