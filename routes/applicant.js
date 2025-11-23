const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireApplicant } = require('../middleware/auth');

router.use(requireApplicant);

// Получить информацию о заявлении абитуриента
router.get('/application', async (req, res) => {
  try {
    const applicantId = req.session.user.id;

    const [applicant, exams] = await Promise.all([
      pool.query(`
        SELECT a.*, s.name as specialty_name, s.code as specialty_code
        FROM applicants a
        JOIN specialties s ON a.specialty_id = s.id
        WHERE a.id = $1
      `, [applicantId]),
      pool.query(`
        SELECT g.id as group_id, s.name as subject_name, g.exam_date, 
               g.room_number, ga.score
        FROM group_applicants ga
        JOIN groups g ON ga.group_id = g.id
        JOIN subjects s ON g.subject_id = s.id
        WHERE ga.applicant_id = $1
        ORDER BY g.exam_date
      `, [applicantId])
    ]);

    if (applicant.rows.length === 0) {
      return res.status(404).json({ error: 'Заявление не найдено' });
    }

    // Вычисляем итоговый балл
    const totalScore = exams.rows.reduce((sum, exam) => {
      return sum + (exam.score || 0);
    }, 0);

    res.json({
      applicant: applicant.rows[0],
      exams: exams.rows,
      totalScore
    });
  } catch (error) {
    console.error('Ошибка при получении заявления:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;

