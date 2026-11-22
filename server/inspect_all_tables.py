import sqlite3

db = sqlite3.connect("prisma/dev.db")

tables = db.execute("""
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
""").fetchall()

for (table,) in tables:
    columns = db.execute(
        f'PRAGMA table_info("{table}")'
    ).fetchall()
    count = db.execute(
        f'SELECT COUNT(*) FROM "{table}"'
    ).fetchone()[0]

    print(f"\n{'='*55}")
    print(f"TABLE: {table} | RECORDS: {count}")
    print("COLUMNS:", ", ".join(col[1] for col in columns))

db.close()
