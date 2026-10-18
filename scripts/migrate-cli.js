/* Applies every pending migration and prints what ran. */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, migrate } from "../backend/db.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.env.DATABASE_FILE || join(root, ".data", "nookspace.sqlite");

const db = openDatabase(file);
const applied = migrate(db, { log: (message) => console.log(message) });
db.close();

console.log(applied ? `Applied ${applied} migration(s) to ${file}` : `Nothing to do; ${file} is current.`);
