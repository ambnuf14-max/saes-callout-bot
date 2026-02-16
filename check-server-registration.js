const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const guildId = '1463815769199476748';

console.log('Проверка регистрации сервера:', guildId, '\n');

// Проверить наличие сервера
db.get("SELECT * FROM servers WHERE guild_id = ?", [guildId], (err, row) => {
  if (err) {
    console.error('Ошибка:', err);
    db.close();
    return;
  }

  if (row) {
    console.log('✅ Сервер найден:');
    console.log('   ID:', row.id);
    console.log('   guild_id:', row.guild_id);
    console.log('   audit_log_channel_id:', row.audit_log_channel_id);

    // Найти департаменты этого сервера
    db.all("SELECT * FROM departments WHERE server_id = ?", [row.id], (err, depts) => {
      if (err) {
        console.error('Ошибка получения департаментов:', err);
      } else {
        console.log('\n📊 Департаменты сервера:', depts.length);
        console.table(depts);
      }
      db.close();
    });
  } else {
    console.log('❌ Сервер НЕ НАЙДЕН в БД!');
    console.log('\n💡 Решение: выполни команду /settings в Discord для инициализации сервера');
    db.close();
  }
});
