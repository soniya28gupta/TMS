import sqlite3

con = sqlite3.connect("prisma/dev.db")

tables = con.execute("""
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
""").fetchall()

for (name,) in tables:
    count = con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
    print(f"{name}: {count} records")

con.close()
