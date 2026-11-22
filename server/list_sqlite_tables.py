import sqlite3

db = sqlite3.connect("prisma/dev.db")

print("SQLITE TABLES:")
for row in db.execute("""
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
"""):
    print(row[0])

db.close()
