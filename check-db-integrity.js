/**
 * Скрипт для проверки целостности foreign keys в базе данных
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Проверка целостности БД...\n');

// Проверка департаментов с несуществующими server_id
db.all(`
  SELECT d.id, d.name, d.server_id, s.id as actual_server_id
  FROM departments d
  LEFT JOIN servers s ON d.server_id = s.id
  WHERE s.id IS NULL
`, (err, rows) => {
  if (err) {
    console.error('Ошибка проверки departments:', err);
    return;
  }

  if (rows.length > 0) {
    console.log('❌ НАЙДЕНЫ ДЕПАРТАМЕНТЫ С НЕСУЩЕСТВУЮЩИМИ server_id:');
    console.table(rows);
  } else {
    console.log('✅ Все департаменты имеют валидные server_id');
  }
});

// Проверка подразделений с несуществующими department_id
db.all(`
  SELECT s.id, s.name, s.department_id, d.id as actual_dept_id
  FROM subdivisions s
  LEFT JOIN departments d ON s.department_id = d.id
  WHERE d.id IS NULL
`, (err, rows) => {
  if (err) {
    console.error('Ошибка проверки subdivisions:', err);
    return;
  }

  if (rows.length > 0) {
    console.log('\n❌ НАЙДЕНЫ ПОДРАЗДЕЛЕНИЯ С НЕСУЩЕСТВУЮЩИМИ department_id:');
    console.table(rows);
  } else {
    console.log('✅ Все подразделения имеют валидные department_id');
  }
});

// Показать все servers
db.all('SELECT * FROM servers', (err, rows) => {
  if (err) {
    console.error('Ошибка получения servers:', err);
    return;
  }
  console.log('\n📊 Все серверы в БД:');
  console.table(rows);
});

// Показать все departments
db.all('SELECT id, name, server_id FROM departments', (err, rows) => {
  if (err) {
    console.error('Ошибка получения departments:', err);
    return;
  }
  console.log('\n📊 Все департаменты в БД:');
  console.table(rows);

  // Закрыть БД после всех запросов
  setTimeout(() => db.close(), 1000);
});
