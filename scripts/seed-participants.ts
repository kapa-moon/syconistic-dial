import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { participants } from "../src/lib/schema"

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

function generatePID(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // removed ambiguous chars like 0/O, 1/I
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

async function seed(count: number) {
  const ids = Array.from({ length: count }, () => ({ id: generatePID() }))
  
  await db.insert(participants).values(ids)
  
  console.log("Generated PIDs:")
  ids.forEach(p => console.log(p.id))
}

seed(20) // change number to however many participants you need