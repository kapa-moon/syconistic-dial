CREATE TABLE "feedback_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" text,
	"conversation_id" uuid,
	"feeling_score" integer,
	"helpfulness_score" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "thinking" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "memory" text;--> statement-breakpoint
ALTER TABLE "feedback_ratings" ADD CONSTRAINT "feedback_ratings_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_ratings" ADD CONSTRAINT "feedback_ratings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;