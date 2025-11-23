const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcrypt');

// Вход как абитуриент
router.post('/login/applicant', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const result = await pool.query(
      'SELECT id, first_name, last_name, middle_name, email, password FROM applicants WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const applicant = result.rows[0];
    const validPassword = await bcrypt.compare(password, applicant.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    req.session.user = {
      id: applicant.id,
      type: 'applicant',
      email: applicant.email,
      name: `${applicant.last_name} ${applicant.first_name} ${applicant.middle_name || ''}`.trim()
    };

    res.json({ success: true, user: req.session.user });
  } catch (error) {
    console.error('Ошибка при входе абитуриента:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Вход как сотрудник
router.post('/login/staff', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const result = await pool.query(
      'SELECT id, first_name, last_name, middle_name, email, password, is_teacher, is_secretary FROM teachers WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const teacher = result.rows[0];
    const validPassword = await bcrypt.compare(password, teacher.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    if (!teacher.is_teacher && !teacher.is_secretary) {
      return res.status(403).json({ error: 'У вас нет доступа к системе' });
    }

    req.session.user = {
      id: teacher.id,
      type: 'staff',
      email: teacher.email,
      name: `${teacher.last_name} ${teacher.first_name} ${teacher.middle_name || ''}`.trim(),
      is_teacher: teacher.is_teacher,
      is_secretary: teacher.is_secretary
    };

    res.json({ success: true, user: req.session.user });
  } catch (error) {
    console.error('Ошибка при входе сотрудника:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Выход
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при выходе' });
    }
    res.json({ success: true });
  });
});

// Регистрация абитуриента
router.post('/register/applicant', async (req, res) => {
  try {
    const {
      first_name, last_name, middle_name, birth_date, passport_data,
      address, phone, email, password, specialty_id
    } = req.body;

    if (!first_name || !last_name || !birth_date || !passport_data || 
        !address || !email || !password || !specialty_id) {
      return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
    }

    // Проверка существования email
    const existing = await pool.query(
      'SELECT id FROM applicants WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email уже используется' });
    }

    // Проверка существования специальности
    const specialtyCheck = await pool.query(
      'SELECT id FROM specialties WHERE id = $1',
      [specialty_id]
    );

    if (specialtyCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Специальность не найдена' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO applicants (first_name, last_name, middle_name, birth_date, 
                             passport_data, address, phone, email, password, 
                             application_date, specialty_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10, 'registered')
      RETURNING id, first_name, last_name, middle_name, email
    `, [first_name, last_name, middle_name, birth_date, passport_data,
        address, phone, email, hashedPassword, specialty_id]);

    // Автоматический вход после регистрации
    req.session.user = {
      id: result.rows[0].id,
      type: 'applicant',
      email: result.rows[0].email,
      name: `${result.rows[0].last_name} ${result.rows[0].first_name} ${result.rows[0].middle_name || ''}`.trim()
    };

    res.status(201).json({ success: true, user: req.session.user });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email уже используется' });
    }
    console.error('Ошибка при регистрации абитуриента:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Регистрация сотрудника
router.post('/register/staff', async (req, res) => {
  try {
    console.log('Register staff request body:', req.body);
    const {
      first_name, last_name, middle_name, phone, email, password
    } = req.body;

    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
    }

    // Проверка существования email
    const existing = await pool.query(
      'SELECT id FROM teachers WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email уже используется' });
    }

    // Роли назначаются только секретарем через админ-панель
    // При регистрации все роли устанавливаются в false
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Inserting teacher with is_teacher=false, is_secretary=false');
    const result = await pool.query(`
      INSERT INTO teachers (first_name, last_name, middle_name, phone, email, password, is_teacher, is_secretary)
      VALUES ($1, $2, $3, $4, $5, $6, false, false)
      RETURNING id, first_name, last_name, middle_name, email, is_teacher, is_secretary
    `, [first_name, last_name, middle_name, phone, email, hashedPassword]);

    console.log('Teacher registered successfully:', result.rows[0]);

    // После регистрации пользователь не может войти, пока секретарь не назначит ему роль
    res.status(201).json({ 
      success: true, 
      message: 'Регистрация успешна. Ожидайте назначения роли секретарем для доступа к системе.'
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email уже используется' });
    }
    console.error('Ошибка при регистрации сотрудника:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить список специальностей для регистрации
router.get('/specialties', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, code FROM specialties ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении специальностей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Проверка текущего пользователя
router.get('/me', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Не авторизован' });
  }
});

module.exports = router;

