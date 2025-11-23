const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireTeacher } = require('../middleware/auth');

router.use(requireTeacher);

// Получить группы преподавателя
router.get('/groups', async (req, res) => {
  try {
    const teacherId = req.session.user.id;

    const result = await pool.query(`
      SELECT g.id, g.exam_date, g.room_number,
             s.name as subject_name,
             COUNT(DISTINCT ga.applicant_id) as applicants_count
      FROM groups g
      JOIN subjects s ON g.subject_id = s.id
      JOIN group_teachers gt ON g.id = gt.group_id
      LEFT JOIN group_applicants ga ON g.id = ga.group_id
      WHERE gt.teacher_id = $1
      GROUP BY g.id, g.exam_date, g.room_number, s.name
      ORDER BY g.exam_date DESC
    `, [teacherId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении групп преподавателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить детальную информацию о группе
router.get('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.session.user.id;

    // Проверяем, что преподаватель назначен на эту группу
    const checkResult = await pool.query(
      'SELECT 1 FROM group_teachers WHERE group_id = $1 AND teacher_id = $2',
      [id, teacherId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: 'У вас нет доступа к этой группе' });
    }

    const [group, applicants] = await Promise.all([
      pool.query(`
        SELECT g.*, s.name as subject_name
        FROM groups g
        JOIN subjects s ON g.subject_id = s.id
        WHERE g.id = $1
      `, [id]),
      pool.query(`
        SELECT a.id, a.first_name, a.last_name, a.middle_name, ga.score
        FROM group_applicants ga
        JOIN applicants a ON ga.applicant_id = a.id
        WHERE ga.group_id = $1
        ORDER BY a.last_name, a.first_name
      `, [id])
    ]);

    if (group.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    res.json({
      group: group.rows[0],
      applicants: applicants.rows
    });
  } catch (error) {
    console.error('Ошибка при получении информации о группе:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Сохранить результаты экзамена
router.put('/groups/:id/results', async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.session.user.id;
    const { results } = req.body; // [{ applicant_id, score }, ...]

    // Проверяем доступ
    const checkResult = await pool.query(
      'SELECT 1 FROM group_teachers WHERE group_id = $1 AND teacher_id = $2',
      [id, teacherId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: 'У вас нет доступа к этой группе' });
    }

    if (!Array.isArray(results)) {
      return res.status(400).json({ error: 'Результаты должны быть массивом' });
    }

    await pool.query('BEGIN');

    for (const { applicant_id, score } of results) {
      if (score !== null && score !== undefined) {
        await pool.query(`
          UPDATE group_applicants
          SET score = $1
          WHERE group_id = $2 AND applicant_id = $3
        `, [score, id, applicant_id]);
      }
    }

    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Ошибка при сохранении результатов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;

