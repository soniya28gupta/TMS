import sqlite3

db = sqlite3.connect("prisma/dev.db")

print("POSITION TABLE COLUMNS:")
for row in db.execute("PRAGMA table_info('Position')"):
    print(row)

print("\nPOSITION RECORD COUNT:")
print(db.execute("SELECT COUNT(*) FROM Position").fetchone()[0])

db.close()
