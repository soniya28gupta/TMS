import Database from "better-sqlite3";
import { Prisma } from "@prisma/client";

const db = new Database("prisma/dev.db", {
  readonly: true,
  fileMustExist: true
});

const sqliteTables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
`).all().map(x => x.name);

const models = Prisma.dmmf.datamodel.models;
const modelTables = models.map(m => m.dbName || m.name);

console.log("PRISMA MODEL COUNT:", models.length);
console.log("SQLITE TABLE COUNT:", sqliteTables.length);

for (const model of models) {
  const table = model.dbName || model.name;

  const sqliteColumns = db.prepare(
    `PRAGMA table_info("${table.replaceAll('"', '""')}")`
  ).all().map(c => c.name);

  const prismaColumns = model.fields
    .filter(f => f.kind === "scalar")
    .map(f => f.dbName || f.name);

  const missingInPrisma = sqliteColumns.filter(
    c => !prismaColumns.includes(c)
  );

  const missingInSQLite = prismaColumns.filter(
    c => !sqliteColumns.includes(c)
  );

  console.log(`\nTABLE: ${table}`);
  console.log("SQLite columns:", sqliteColumns.length);
  console.log("Prisma scalar fields:", prismaColumns.length);
  console.log("Missing in Prisma:", missingInPrisma.length ? missingInPrisma : "None");
  console.log("Missing in SQLite:", missingInSQLite.length ? missingInSQLite : "None");
}

console.log("\nTABLES WITHOUT PRISMA MODEL:",
  sqliteTables.filter(t => !modelTables.includes(t))
);

db.close();
