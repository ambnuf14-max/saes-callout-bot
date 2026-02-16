const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Проверить существование таблицы pending_changes
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_changes'", (err, row) => {
  if (err) {
    console.error('Ошибка:', err);
    db.close();
    return;
  }

  if (!row) {
    console.log('❌ Таблица pending_changes НЕ СУЩЕСТВУЕТ!');
    console.log('   Нужно запустить миграцию 007_approval_and_types_system.ts');
    db.close();
    return;
  }

  console.log('✅ Таблица pending_changes существует\n');

  // Показать все pending changes
  db.all('SELECT * FROM pending_changes', (err, rows) => {
    if (err) {
      console.error('Ошибка чтения pending_changes:', err);
      db.close();
      return;
    }

    console.log(`📊 Количество pending changes: ${rows.length}\n`);

    if (rows.length > 0) {
      console.table(rows);
    }

    db.close();
  });
});
