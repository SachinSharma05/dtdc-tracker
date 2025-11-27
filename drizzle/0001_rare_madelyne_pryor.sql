CREATE TABLE "courier_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_price" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_weights" (
	"id" serial PRIMARY KEY NOT NULL,
	"min_weight" numeric NOT NULL,
	"max_weight" numeric NOT NULL,
	"price" numeric NOT NULL
);
