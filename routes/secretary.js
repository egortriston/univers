const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { requireSecretary } = require('../middleware/auth');

// Все маршруты требуют прав секретаря
router.use(requireSecretary);

// Дашборд - статистика
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [applicationsCount, admittedCount, statusCounts, upcomingExams] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM applicants'),
      pool.query("SELECT COUNT(*) as count FROM applicants WHERE status = 'admitted'"),
      pool.query('SELECT status, COUNT(*) as count FROM applicants GROUP BY status'),
      pool.query(`
        SELECT g.id, g.exam_date, s.name as subject_name, g.room_number, 
               COUNT(DISTINCT ga.applicant_id) as applicants_count
        FROM groups g
        JOIN subjects s ON g.subject_id = s.id
        LEFT JOIN group_applicants ga ON g.id = ga.group_id
        WHERE g.exam_date >= NOW()
        GROUP BY g.id, g.exam_date, s.name, g.room_number
        ORDER BY g.exam_date ASC
        LIMIT 10
      `)
    ]);

    res.json({
      applicationsCount: parseInt(applicationsCount.rows[0].count),
      admittedCount: parseInt(admittedCount.rows[0].count),
      statusCounts: statusCounts.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {}),
      upcomingExams: upcomingExams.rows
    });
  } catch (error) {
    console.error('Ошибка при получении статистики:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить всех абитуриентов
router.get('/applicants', async (req, res) => {
  try {
    const { sortBy = 'id', sortOrder = 'ASC', status, specialty_id, search } = req.query;
    
    let query = `
      SELECT a.id, a.first_name, a.last_name, a.middle_name, a.birth_date, 
             a.application_date, a.status, a.email, a.phone,
             s.name as specialty_name, s.code as specialty_code
      FROM applicants a
      JOIN specialties s ON a.specialty_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND a.status = $${paramIndex++}`;
      params.push(status);
    }

    if (specialty_id) {
      query += ` AND a.specialty_id = $${paramIndex++}`;
      params.push(specialty_id);
    }

    if (search) {
      query += ` AND (a.first_name ILIKE $${paramIndex} OR a.last_name ILIKE $${paramIndex} OR a.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const validSortColumns = ['id', 'first_name', 'last_name', 'birth_date', 'application_date', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'id';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    query += ` ORDER BY a.${sortColumn} ${order}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении абитуриентов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить детальную информацию об абитуриенте
router.get('/applicants/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [applicant, exams] = await Promise.all([
      pool.query(`
        SELECT a.*, s.name as specialty_name, s.code as specialty_code
        FROM applicants a
        JOIN specialties s ON a.specialty_id = s.id
        WHERE a.id = $1
      `, [id]),
      pool.query(`
        SELECT g.id as group_id, s.name as subject_name, g.exam_date, 
               g.room_number, ga.score
        FROM group_applicants ga
        JOIN groups g ON ga.group_id = g.id
        JOIN subjects s ON g.subject_id = s.id
        WHERE ga.applicant_id = $1
        ORDER BY g.exam_date
      `, [id])
    ]);

    if (applicant.rows.length === 0) {
      return res.status(404).json({ error: 'Абитуриент не найден' });
    }

    res.json({
      applicant: applicant.rows[0],
      exams: exams.rows
    });
  } catch (error) {
    console.error('Ошибка при получении информации об абитуриенте:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Создать абитуриента
router.post('/applicants', async (req, res) => {
  try {
    const {
      first_name, last_name, middle_name, birth_date, passport_data,
      address, phone, email, password, specialty_id
    } = req.body;

    if (!first_name || !last_name || !birth_date || !passport_data || 
        !address || !email || !password || !specialty_id) {
      return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO applicants (first_name, last_name, middle_name, birth_date, 
                             passport_data, address, phone, email, password, 
                             application_date, specialty_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10, 'registered')
      RETURNING *
    `, [first_name, last_name, middle_name, birth_date, passport_data,
        address, phone, email, hashedPassword, specialty_id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email уже используется' });
    }
    console.error('Ошибка при создании абитуриента:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обновить абитуриента
router.put('/applicants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name, last_name, middle_name, birth_date, passport_data,
      address, phone, email, specialty_id, status
    } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (first_name) { updates.push(`first_name = $${paramIndex++}`); params.push(first_name); }
    if (last_name) { updates.push(`last_name = $${paramIndex++}`); params.push(last_name); }
    if (middle_name !== undefined) { updates.push(`middle_name = $${paramIndex++}`); params.push(middle_name); }
    if (birth_date) { updates.push(`birth_date = $${paramIndex++}`); params.push(birth_date); }
    if (passport_data) { updates.push(`passport_data = $${paramIndex++}`); params.push(passport_data); }
    if (address) { updates.push(`address = $${paramIndex++}`); params.push(address); }
    if (phone !== undefined) { updates.push(`phone = $${paramIndex++}`); params.push(phone); }
    if (email) { updates.push(`email = $${paramIndex++}`); params.push(email); }
    if (specialty_id) { updates.push(`specialty_id = $${paramIndex++}`); params.push(specialty_id); }
    if (status) { updates.push(`status = $${paramIndex++}`); params.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    params.push(id);
    const query = `UPDATE applicants SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка при обновлении абитуриента:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить все группы
router.get('/groups', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.id, g.exam_date, g.room_number,
             s.name as subject_name, s.id as subject_id,
             COUNT(DISTINCT ga.applicant_id) as applicants_count,
             COUNT(DISTINCT gt.teacher_id) as teachers_count
      FROM groups g
      JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN group_applicants ga ON g.id = ga.group_id
      LEFT JOIN group_teachers gt ON g.id = gt.group_id
      GROUP BY g.id, g.exam_date, g.room_number, s.name, s.id
      ORDER BY g.exam_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении групп:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить всех преподавателей для модального окна (с информацией о добавлении в группу)
// ВАЖНО: Этот маршрут должен быть ПЕРЕД /groups/:id, иначе он не будет работать
router.get('/groups/:id/teachers-list', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT t.id, t.first_name, t.last_name, t.middle_name,
             CASE WHEN gt.group_id IS NOT NULL THEN true ELSE false END as in_group
      FROM teachers t
      LEFT JOIN group_teachers gt ON t.id = gt.teacher_id AND gt.group_id = $1
      ORDER BY t.last_name, t.first_name
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении списка преподавателей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить всех абитуриентов для модального окна (с информацией о сдаче экзамена и добавлении в группу)
// ВАЖНО: Этот маршрут должен быть ПЕРЕД /groups/:id, иначе он не будет работать
router.get('/groups/:id/applicants-list', async (req, res) => {
  try {
    console.log('GET /groups/:id/applicants-list called with id:', req.params.id);
    const { id } = req.params;

    // Получаем subject_id группы
    const groupResult = await pool.query('SELECT subject_id FROM groups WHERE id = $1', [id]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    const subjectId = groupResult.rows[0].subject_id;

    // Получаем всех абитуриентов, у которых специальность требует этот предмет
    // с информацией о том, сдавали ли они экзамен и добавлены ли в эту группу
    const result = await pool.query(`
      SELECT DISTINCT 
        a.id, 
        a.first_name, 
        a.last_name, 
        a.middle_name, 
        a.email,
        sp.name as specialty_name,
        CASE WHEN ga_current.group_id IS NOT NULL THEN true ELSE false END as in_group,
        CASE WHEN EXISTS (
          SELECT 1 FROM group_applicants ga_exam
          JOIN groups g_exam ON ga_exam.group_id = g_exam.id
          WHERE ga_exam.applicant_id = a.id 
          AND g_exam.subject_id = $2
          AND ga_exam.score IS NOT NULL
        ) THEN true ELSE false END as has_passed_exam
      FROM applicants a
      JOIN specialties sp ON a.specialty_id = sp.id
      JOIN specialty_subjects ss ON sp.id = ss.specialty_id
      LEFT JOIN group_applicants ga_current ON a.id = ga_current.applicant_id AND ga_current.group_id = $1
      WHERE ss.subject_id = $2
      ORDER BY a.last_name, a.first_name
    `, [id, subjectId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении списка абитуриентов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить доступных абитуриентов для добавления в группу (по требованиям специальности)
// ВАЖНО: Этот маршрут должен быть ПЕРЕД /groups/:id, иначе он не будет работать
router.get('/groups/:id/available-applicants', async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем subject_id группы
    const groupResult = await pool.query('SELECT subject_id FROM groups WHERE id = $1', [id]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    const subjectId = groupResult.rows[0].subject_id;

    // Находим абитуриентов, у которых специальность требует этот предмет
    // и которые еще не добавлены в эту группу
    const result = await pool.query(`
      SELECT DISTINCT a.id, a.first_name, a.last_name, a.middle_name, a.email,
             s.name as specialty_name
      FROM applicants a
      JOIN specialties sp ON a.specialty_id = sp.id
      JOIN specialty_subjects ss ON sp.id = ss.specialty_id
      JOIN subjects s ON ss.subject_id = s.id
      LEFT JOIN group_applicants ga ON a.id = ga.applicant_id AND ga.group_id = $1
      WHERE ss.subject_id = $2 AND ga.applicant_id IS NULL
    `, [id, subjectId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении доступных абитуриентов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить детальную информацию о группе
router.get('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [group, teachers, applicants, results] = await Promise.all([
      pool.query(`
        SELECT g.*, s.name as subject_name
        FROM groups g
        JOIN subjects s ON g.subject_id = s.id
        WHERE g.id = $1
      `, [id]),
      pool.query(`
        SELECT t.id, t.first_name, t.last_name, t.middle_name
        FROM group_teachers gt
        JOIN teachers t ON gt.teacher_id = t.id
        WHERE gt.group_id = $1
      `, [id]),
      pool.query(`
        SELECT a.id, a.first_name, a.last_name, a.middle_name, a.email
        FROM group_applicants ga
        JOIN applicants a ON ga.applicant_id = a.id
        WHERE ga.group_id = $1
      `, [id]),
      pool.query(`
        SELECT a.id, a.first_name, a.last_name, a.middle_name, ga.score
        FROM group_applicants ga
        JOIN applicants a ON ga.applicant_id = a.id
        WHERE ga.group_id = $1
      `, [id])
    ]);

    if (group.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    res.json({
      group: group.rows[0],
      teachers: teachers.rows,
      applicants: applicants.rows,
      results: results.rows
    });
  } catch (error) {
    console.error('Ошибка при получении информации о группе:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Создать группу
router.post('/groups', async (req, res) => {
  try {
    const { subject_id, exam_date, room_number } = req.body;

    if (!subject_id || !exam_date) {
      return res.status(400).json({ error: 'Предмет и дата экзамена обязательны' });
    }

    const result = await pool.query(`
      INSERT INTO groups (subject_id, exam_date, room_number)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [subject_id, exam_date, room_number || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка при создании группы:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Добавить преподавателя в группу
router.post('/groups/:id/teachers', async (req, res) => {
  try {
    const { id } = req.params;
    const { teacher_id } = req.body;

    if (!teacher_id) {
      return res.status(400).json({ error: 'ID преподавателя обязателен' });
    }

    await pool.query(`
      INSERT INTO group_teachers (group_id, teacher_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [id, teacher_id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при добавлении преподавателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Удалить преподавателя из группы
router.delete('/groups/:id/teachers/:teacherId', async (req, res) => {
  try {
    const { id, teacherId } = req.params;
    await pool.query('DELETE FROM group_teachers WHERE group_id = $1 AND teacher_id = $2', [id, teacherId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при удалении преподавателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Удалить абитуриента из группы
router.delete('/groups/:id/applicants/:applicantId', async (req, res) => {
  try {
    const { id, applicantId } = req.params;
    await pool.query('DELETE FROM group_applicants WHERE group_id = $1 AND applicant_id = $2', [id, applicantId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при удалении абитуриента:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обновить результаты экзамена
router.put('/groups/:id/results', async (req, res) => {
  try {
    const { id } = req.params;
    const { results } = req.body; // [{ applicant_id, score }, ...]

    if (!Array.isArray(results)) {
      return res.status(400).json({ error: 'Результаты должны быть массивом' });
    }

    await pool.query('BEGIN');

    for (const { applicant_id, score } of results) {
      await pool.query(`
        UPDATE group_applicants
        SET score = $1
        WHERE group_id = $2 AND applicant_id = $3
      `, [score, id, applicant_id]);
    }

    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Ошибка при обновлении результатов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Добавить абитуриента в группу (с автоматическим удалением из других групп по тому же предмету)
// ВАЖНО: Этот маршрут должен быть ПЕРЕД общим /groups/:id/applicants, но после /groups/:id/applicants-list
// Обновляем существующий маршрут, чтобы он удалял из других групп
router.post('/groups/:id/applicants', async (req, res) => {
  try {
    const { id } = req.params;
    const { applicant_id } = req.body;

    if (!applicant_id) {
      return res.status(400).json({ error: 'ID абитуриента обязателен' });
    }

    // Получаем subject_id группы
    const groupResult = await pool.query('SELECT subject_id FROM groups WHERE id = $1', [id]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    const subjectId = groupResult.rows[0].subject_id;

    await pool.query('BEGIN');

    // Удаляем абитуриента из других групп по тому же предмету
    await pool.query(`
      DELETE FROM group_applicants
      WHERE applicant_id = $1 
      AND group_id IN (
        SELECT id FROM groups WHERE subject_id = $2 AND id != $3
      )
    `, [applicant_id, subjectId, id]);

    // Добавляем в текущую группу
    await pool.query(`
      INSERT INTO group_applicants (group_id, applicant_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [id, applicant_id]);

    await pool.query('COMMIT');

    res.json({ 
      success: true, 
      message: 'Абитуриент добавлен. Если он был в другой группе по этому предмету, он был автоматически удален оттуда.'
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Ошибка при добавлении абитуриента:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Справочники: Специальности
router.get('/specialties', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM specialties ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении специальностей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/specialties', async (req, res) => {
  try {
    const { name, code, seats_count, subject_ids } = req.body;
    if (!name || !code || !seats_count) {
      return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
    }

    await pool.query('BEGIN');

    const specialtyResult = await pool.query(`
      INSERT INTO specialties (name, code, seats_count)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [name, code, seats_count]);

    const specialtyId = specialtyResult.rows[0].id;

    if (subject_ids && Array.isArray(subject_ids)) {
      for (const subjectId of subject_ids) {
        await pool.query(`
          INSERT INTO specialty_subjects (specialty_id, subject_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [specialtyId, subjectId]);
      }
    }

    await pool.query('COMMIT');
    res.status(201).json(specialtyResult.rows[0]);
  } catch (error) {
    await pool.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Код специальности уже существует' });
    }
    console.error('Ошибка при создании специальности:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.put('/specialties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, seats_count, subject_ids } = req.body;

    await pool.query('BEGIN');

    if (name || code || seats_count) {
      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (name) { updates.push(`name = $${paramIndex++}`); params.push(name); }
      if (code) { updates.push(`code = $${paramIndex++}`); params.push(code); }
      if (seats_count !== undefined) { updates.push(`seats_count = $${paramIndex++}`); params.push(seats_count); }

      params.push(id);
      await pool.query(`UPDATE specialties SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
    }

    if (subject_ids && Array.isArray(subject_ids)) {
      await pool.query('DELETE FROM specialty_subjects WHERE specialty_id = $1', [id]);
      for (const subjectId of subject_ids) {
        await pool.query(`
          INSERT INTO specialty_subjects (specialty_id, subject_id)
          VALUES ($1, $2)
        `, [id, subjectId]);
      }
    }

    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Ошибка при обновлении специальности:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/specialties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM specialties WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при удалении специальности:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/specialties/:id/subjects', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT s.* FROM subjects s
      JOIN specialty_subjects ss ON s.id = ss.subject_id
      WHERE ss.specialty_id = $1
    `, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении предметов специальности:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Справочники: Преподаватели
router.get('/teachers', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, first_name, last_name, middle_name, phone, email, is_teacher, is_secretary FROM teachers ORDER BY last_name');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении преподавателей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/teachers', async (req, res) => {
  try {
    const { first_name, last_name, middle_name, phone, email, password, is_teacher, is_secretary } = req.body;
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO teachers (first_name, last_name, middle_name, phone, email, password, is_teacher, is_secretary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, first_name, last_name, middle_name, phone, email, is_teacher, is_secretary
    `, [first_name, last_name, middle_name, phone, email, hashedPassword, 
        is_teacher || false, is_secretary || false]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email уже используется' });
    }
    console.error('Ошибка при создании преподавателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.put('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, middle_name, phone, email, password, is_teacher, is_secretary } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (first_name) { updates.push(`first_name = $${paramIndex++}`); params.push(first_name); }
    if (last_name) { updates.push(`last_name = $${paramIndex++}`); params.push(last_name); }
    if (middle_name !== undefined) { updates.push(`middle_name = $${paramIndex++}`); params.push(middle_name); }
    if (phone !== undefined) { updates.push(`phone = $${paramIndex++}`); params.push(phone); }
    if (email) { updates.push(`email = $${paramIndex++}`); params.push(email); }
    if (is_teacher !== undefined) { updates.push(`is_teacher = $${paramIndex++}`); params.push(is_teacher); }
    if (is_secretary !== undefined) { updates.push(`is_secretary = $${paramIndex++}`); params.push(is_secretary); }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push(`password = $${paramIndex++}`);
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE teachers SET ${updates.join(', ')} WHERE id = $${paramIndex} 
       RETURNING id, first_name, last_name, middle_name, phone, email, is_teacher, is_secretary`,
      params
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка при обновлении преподавателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM teachers WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при удалении преподавателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Справочники: Предметы
router.get('/subjects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении предметов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/subjects', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Название предмета обязательно' });
    }

    const result = await pool.query(`
      INSERT INTO subjects (name, description)
      VALUES ($1, $2)
      RETURNING *
    `, [name, description || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка при создании предмета:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.put('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name) { updates.push(`name = $${paramIndex++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(description); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE subjects SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка при обновлении предмета:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM subjects WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при удалении предмета:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;

