const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = '/c/app/data/database.sqlite';
const db = new sqlite3.Database(dbPath);

console.log('Проверка Docker БД:', dbPath, '\n');

// Показать все servers
db.all('SELECT * FROM servers', (err, rows) => {
  if (err) {
    console.error('Ошибка получения servers:', err);
    db.close();
    return;
  }
  console.log('📊 Серверы в Docker БД:');
  console.table(rows);

  // Проверить конкретный guild_id
  db.get("SELECT * FROM servers WHERE guild_id = ?", ['1463815769199476748'], (err, row) => {
    if (err) {
      console.error('Ошибка:', err);
    } else if (row) {
      console.log('\n✅ Сервер найден:', row);
    } else {
      console.log('\n❌ Сервер с guild_id "1463815769199476748" НЕ НАЙДЕН!');
    }

    db.close();
  });
});
